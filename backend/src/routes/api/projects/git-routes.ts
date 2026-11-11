import { Hono, type Context } from "hono";
import z from "zod";
import git from "isomorphic-git";
import {
	broadcastFilesChanged,
	broadcastGitSyncFinished,
	flushAndCloseProjectDocuments,
} from "../../../collab/project-events.ts";
import { ProjectGitNetworkError } from "../../../projects/git-http.ts";
import { logger } from "../../../helpers/logger.ts";
import {
	requireProjectOwner,
	type ProjectRouteVariables,
} from "../../../middleware/project-access-middleware.ts";
import {
	beginGitOperation,
	finishProjectGitSync,
	startProjectGitSync,
	waitForProjectWrites,
} from "../../../projects/git-sync-lock.ts";
import { ProjectGitConflictError } from "../../../projects/git-merge.ts";
import {
	disconnectProjectGit,
	getProjectGitConfig,
	ProjectGitContentError,
	ProjectGitRemoteError,
	ProjectGitNotConfiguredError,
	pullProjectFromGit,
	pushProjectToGit,
	saveProjectGitConfig,
	verifyProjectGitRemote,
} from "../../../projects/git-sync.ts";
import { gitConfigSchema, gitPullSchema } from "./schemas.ts";

type GitRoutesEnv = { Variables: ProjectRouteVariables };

const app = new Hono<GitRoutesEnv>();

function writeOnly(c: Context<GitRoutesEnv>) {
	return c.json({ error: "You do not have write access to this project" }, 403);
}

function alreadySyncing(c: Context<GitRoutesEnv>) {
	return c.json({ error: "This project is already syncing" }, 409);
}

function serverBusy(c: Context<GitRoutesEnv>) {
	return c.json({ error: "Too many Git syncs are running. Try again shortly." }, 429);
}

/** Holds the project's sync lock, which makes editors wait and reconnect once it is released. */
async function withProjectSyncLock<T>(projectId: string, run: () => Promise<T>): Promise<T | null> {
	if (!startProjectGitSync(projectId)) {
		return null;
	}
	try {
		return await run();
	} finally {
		finishProjectGitSync(projectId);
		broadcastFilesChanged(projectId);
		broadcastGitSyncFinished(projectId);
	}
}

app.get("/:projectId/git", async (c) => {
	if (c.get("projectAccess").readOnly) {
		return writeOnly(c);
	}

	return c.json(await getProjectGitConfig(c.req.param("projectId")));
});

app.put("/:projectId/git", requireProjectOwner, async (c) => {
	const parsed = gitConfigSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: z.prettifyError(parsed.error) }, 400);
	}

	const projectId = c.req.param("projectId")!;
	const settings = {
		projectId,
		remoteUrl: parsed.data.remoteUrl,
		branch: parsed.data.branch,
		folder: parsed.data.folder,
		credentials: {
			username: parsed.data.username,
			token: parsed.data.token,
		},
	};
	const release = beginGitOperation();
	if (!release) {
		return serverBusy(c);
	}

	try {
		// Check the remote before locking, so editors are not blocked by a slow network.
		await verifyProjectGitRemote(settings);
		const config = await withProjectSyncLock(projectId, () => saveProjectGitConfig(settings));
		return config ? c.json(config) : alreadySyncing(c);
	} catch (error) {
		if (
			error instanceof ProjectGitRemoteError ||
			error instanceof ProjectGitContentError ||
			error instanceof ProjectGitNetworkError
		) {
			return c.json({ error: error.message }, 400);
		}
		logger.warn(
			{
				projectId,
				error: error instanceof Error ? { name: error.name, message: error.message } : error,
			},
			"Saving Git settings failed",
		);
		return c.json({ error: "Could not save Git settings" }, 500);
	} finally {
		release();
	}
});

app.delete("/:projectId/git", requireProjectOwner, async (c) => {
	const projectId = c.req.param("projectId")!;
	const config = await withProjectSyncLock(projectId, async () => {
		await disconnectProjectGit(projectId);
		return getProjectGitConfig(projectId);
	});
	return config ? c.json(config) : alreadySyncing(c);
});

async function runGitAction(
	c: Context<GitRoutesEnv>,
	action: "pull" | "push",
	resolutions?: Record<string, "project" | "remote">,
) {
	if (c.get("projectAccess").readOnly) {
		return writeOnly(c);
	}

	const projectId = c.req.param("projectId")!;
	const release = beginGitOperation();
	if (!release) {
		return serverBusy(c);
	}

	try {
		const result = await withProjectSyncLock(projectId, async () => {
			await waitForProjectWrites(projectId);
			await flushAndCloseProjectDocuments(projectId);
			const user = c.get("user")!;
			const options = {
				projectId,
				author: { name: user.name || user.email, email: user.email },
			};
			return action === "pull"
				? pullProjectFromGit({ ...options, resolutions })
				: pushProjectToGit(options);
		});
		return result ? c.json(result) : alreadySyncing(c);
	} catch (error) {
		logger.warn(
			{
				projectId,
				action,
				error: error instanceof Error ? { name: error.name, message: error.message } : error,
			},
			`Git ${action} failed`,
		);

		if (error instanceof ProjectGitNetworkError) {
			return c.json({ error: error.message }, 400);
		}
		if (error instanceof ProjectGitNotConfiguredError) {
			return c.json({ error: error.message }, 409);
		}
		if (error instanceof ProjectGitContentError) {
			return c.json({ error: error.message }, 400);
		}
		if (error instanceof ProjectGitConflictError) {
			return c.json({ error: error.message, conflicts: error.conflicts }, 409);
		}
		if (error instanceof git.Errors.MergeConflictError) {
			return c.json(
				{ error: "Git pull stopped because remote changes conflict with this project" },
				409,
			);
		}
		if (
			error instanceof git.Errors.HttpError ||
			error instanceof git.Errors.SmartHttpError ||
			error instanceof git.Errors.UnknownTransportError
		) {
			return c.json({ error: "Could not connect to the Git remote or authenticate" }, 502);
		}
		if (error instanceof git.Errors.GitPushError || error instanceof git.Errors.PushRejectedError) {
			return c.json({ error: "The Git remote has changes; pull before pushing" }, 409);
		}

		return c.json({ error: `Git ${action} failed` }, 500);
	} finally {
		release();
	}
}

app.post("/:projectId/git/pull", async (c) => {
	const parsed = gitPullSchema.safeParse(await c.req.json().catch(() => ({})));
	if (!parsed.success) {
		return c.json({ error: z.prettifyError(parsed.error) }, 400);
	}
	return runGitAction(c, "pull", parsed.data.resolutions);
});
app.post("/:projectId/git/push", (c) => runGitAction(c, "push"));

export default app;
