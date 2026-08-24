import { Hono, type Context } from "hono";
import z from "zod";
import git from "isomorphic-git";
import {
	broadcastFilesChanged,
	broadcastGitPulled,
	flushAndCloseProjectDocuments,
} from "../../../collab/project-events.ts";
import { logger } from "../../../helpers/logger.ts";
import {
	requireProjectOwner,
	type ProjectRouteVariables,
} from "../../../middleware/project-access-middleware.ts";
import { finishProjectGitSync, startProjectGitSync } from "../../../projects/git-sync-lock.ts";
import { ProjectGitConflictError } from "../../../projects/git-merge.ts";
import {
	configureProjectGit,
	getProjectGitConfig,
	ProjectGitContentError,
	ProjectGitNotConfiguredError,
	pullProjectFromGit,
	pushProjectToGit,
} from "../../../projects/git-sync.ts";
import { gitConfigSchema, gitPullSchema } from "./schemas.ts";

type GitRoutesEnv = { Variables: ProjectRouteVariables };

const app = new Hono<GitRoutesEnv>();

function writeOnly(c: Context<GitRoutesEnv>) {
	return c.json({ error: "You do not have write access to this project" }, 403);
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
	if (!startProjectGitSync(projectId)) {
		return c.json({ error: "This project is already syncing" }, 409);
	}

	try {
		return c.json(
			await configureProjectGit({
				projectId,
				remoteUrl: parsed.data.remoteUrl,
				branch: parsed.data.branch,
				credentials: {
					username: parsed.data.username,
					token: parsed.data.token,
				},
			}),
		);
	} catch (error) {
		logger.warn(
			{
				projectId,
				error: error instanceof Error ? { name: error.name, message: error.message } : error,
			},
			"Saving Git settings failed",
		);
		return c.json({ error: "Could not save Git settings" }, 500);
	} finally {
		finishProjectGitSync(projectId);
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
	if (!startProjectGitSync(projectId)) {
		return c.json({ error: "This project is already syncing" }, 409);
	}
	let pulled = false;

	try {
		await flushAndCloseProjectDocuments(projectId);
		const user = c.get("user")!;
		const options = {
			projectId,
			author: { name: user.name || user.email, email: user.email },
		};

		if (action === "pull") {
			const result = await pullProjectFromGit({ ...options, resolutions });
			pulled = result.pulled;
			return c.json(result);
		}

		return c.json(await pushProjectToGit(options));
	} catch (error) {
		logger.warn(
			{
				projectId,
				action,
				error: error instanceof Error ? { name: error.name, message: error.message } : error,
			},
			`Git ${action} failed`,
		);

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
		finishProjectGitSync(projectId);
		broadcastFilesChanged(projectId);
		if (pulled) {
			broadcastGitPulled(projectId);
		}
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
