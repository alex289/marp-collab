import { Hono, type Context } from "hono";
import z from "zod";
import { ProjectGitNetworkError } from "../../../projects/git-http.ts";
import { logger } from "../../../helpers/logger.ts";
import {
	requireProjectOwner,
	type ProjectRouteVariables,
} from "../../../middleware/project-access-middleware.ts";
import {
	ProjectDeletedError,
	ProjectGitBusyError,
	ProjectGitServerBusyError,
	syncProjectWithGit,
	withGitOperation,
	withProjectConfigureLock,
	type ProjectGitAction,
} from "../../../projects/git-actions.ts";
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
	saveProjectGitConfig,
	verifyProjectGitRemote,
} from "../../../projects/git-sync.ts";
import { gitConfigSchema, gitPullSchema } from "./schemas.ts";

type GitRoutesEnv = { Variables: ProjectRouteVariables };

const app = new Hono<GitRoutesEnv>();

function writeOnly(c: Context<GitRoutesEnv>) {
	return c.json({ error: "You do not have write access to this project" }, 403);
}

/** Answers for errors every Git operation can report; returns undefined for others. */
function lockErrorResponse(c: Context<GitRoutesEnv>, error: unknown) {
	if (error instanceof ProjectDeletedError) {
		return c.json({ error: error.message }, 404);
	}
	if (error instanceof ProjectGitBusyError) {
		return c.json({ error: error.message }, 409);
	}
	if (error instanceof ProjectGitServerBusyError) {
		return c.json({ error: error.message }, 429);
	}
	return undefined;
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
	try {
		const config = await withGitOperation(async () => {
			// Check the remote before locking, so a slow network does not hold the repository.
			await verifyProjectGitRemote(settings);
			return withProjectConfigureLock(projectId, () => saveProjectGitConfig(settings));
		});
		return c.json(config);
	} catch (error) {
		const response = lockErrorResponse(c, error);
		if (response) {
			return response;
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
	}
});

app.delete("/:projectId/git", requireProjectOwner, async (c) => {
	const projectId = c.req.param("projectId")!;
	try {
		const config = await withProjectConfigureLock(projectId, async () => {
			await disconnectProjectGit(projectId);
			return getProjectGitConfig(projectId);
		});
		return c.json(config);
	} catch (error) {
		const response = lockErrorResponse(c, error);
		if (response) {
			return response;
		}
		throw error;
	}
});

async function runGitAction(c: Context<GitRoutesEnv>, action: ProjectGitAction) {
	if (c.get("projectAccess").readOnly) {
		return writeOnly(c);
	}

	const projectId = c.req.param("projectId")!;
	const user = c.get("user")!;
	try {
		return c.json(
			await syncProjectWithGit(
				projectId,
				{ name: user.name || user.email, email: user.email },
				action,
			),
		);
	} catch (error) {
		const response = lockErrorResponse(c, error);
		if (response) {
			return response;
		}
		logger.warn(
			{
				projectId,
				action: action.type,
				error: error instanceof Error ? { name: error.name, message: error.message } : error,
			},
			`Git ${action.type} failed`,
		);

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

		return c.json({ error: `Git ${action.type} failed` }, 500);
	}
}

app.post("/:projectId/git/pull", async (c) => {
	const parsed = gitPullSchema.safeParse(await c.req.json().catch(() => ({})));
	if (!parsed.success) {
		return c.json({ error: z.prettifyError(parsed.error) }, 400);
	}
	return runGitAction(c, { type: "pull", resolutions: parsed.data.resolutions });
});
app.post("/:projectId/git/push", (c) => runGitAction(c, { type: "push" }));

export default app;
