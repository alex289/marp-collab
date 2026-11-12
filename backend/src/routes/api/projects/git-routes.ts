import { Hono, type Context } from "hono";
import z from "zod";
import {
	broadcastFilesChanged,
	broadcastGitSyncFinished,
	flushAndCloseProjectDocuments,
} from "../../../collab/project-events.ts";
import { getProjectById } from "../../../db/models/project.ts";
import { ProjectGitNetworkError } from "../../../projects/git-http.ts";
import { logger } from "../../../helpers/logger.ts";
import {
	requireProjectOwner,
	type ProjectRouteVariables,
} from "../../../middleware/project-access-middleware.ts";
import {
	beginGitOperation,
	finishProjectGitConfigure,
	finishProjectGitSync,
	startProjectGitConfigure,
	startProjectGitSync,
	waitForProjectWrites,
} from "../../../projects/git-sync-lock.ts";
import { ProjectGitConflictError } from "../../../projects/git-merge.ts";
import {
	disconnectProjectGit,
	getProjectGitConfig,
	ProjectGitContentError,
	ProjectGitNotConfiguredError,
	ProjectGitProcessError,
	ProjectGitRejectedError,
	ProjectGitRemoteError,
	ProjectGitTransportError,
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

class ProjectDeletedError extends Error {}

/** Deleting a project holds its Git lock, so a deletion has finished if the project is gone now. */
function assertProjectExists(projectId: string): void {
	if (!getProjectById(projectId)) {
		throw new ProjectDeletedError("Project not found");
	}
}

/** Holds the project's sync lock, which makes editors wait and reconnect once it is released. */
async function withProjectSyncLock<T>(projectId: string, run: () => Promise<T>): Promise<T | null> {
	if (!startProjectGitSync(projectId)) {
		return null;
	}
	try {
		assertProjectExists(projectId);
		return await run();
	} finally {
		finishProjectGitSync(projectId);
		broadcastFilesChanged(projectId);
		broadcastGitSyncFinished(projectId);
	}
}

/** Holds the project's Git repository for a settings change; editors keep working meanwhile. */
async function withProjectConfigureLock<T>(
	projectId: string,
	run: () => Promise<T>,
): Promise<T | null> {
	if (!startProjectGitConfigure(projectId)) {
		return null;
	}
	try {
		assertProjectExists(projectId);
		return await run();
	} finally {
		finishProjectGitConfigure(projectId);
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
		// Check the remote before locking, so a slow network does not hold the repository.
		await verifyProjectGitRemote(settings);
		const config = await withProjectConfigureLock(projectId, () => saveProjectGitConfig(settings));
		return config ? c.json(config) : alreadySyncing(c);
	} catch (error) {
		if (error instanceof ProjectDeletedError) {
			return c.json({ error: error.message }, 404);
		}
		if (
			error instanceof ProjectGitRemoteError ||
			error instanceof ProjectGitContentError ||
			error instanceof ProjectGitNetworkError ||
			(error instanceof ProjectGitProcessError && error.exceededLimit)
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
	try {
		const config = await withProjectConfigureLock(projectId, async () => {
			await disconnectProjectGit(projectId);
			return getProjectGitConfig(projectId);
		});
		return config ? c.json(config) : alreadySyncing(c);
	} catch (error) {
		if (error instanceof ProjectDeletedError) {
			return c.json({ error: error.message }, 404);
		}
		throw error;
	}
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

		if (error instanceof ProjectDeletedError) {
			return c.json({ error: error.message }, 404);
		}
		if (
			error instanceof ProjectGitNetworkError ||
			error instanceof ProjectGitContentError ||
			(error instanceof ProjectGitProcessError && error.exceededLimit)
		) {
			return c.json({ error: error.message }, 400);
		}
		if (error instanceof ProjectGitNotConfiguredError) {
			return c.json({ error: error.message }, 409);
		}
		if (error instanceof ProjectGitConflictError) {
			return c.json({ error: error.message, conflicts: error.conflicts }, 409);
		}
		if (error instanceof ProjectGitRejectedError) {
			return c.json({ error: error.message }, 409);
		}
		if (error instanceof ProjectGitTransportError) {
			return c.json({ error: error.message }, 502);
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
