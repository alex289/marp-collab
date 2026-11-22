import { Hono, type Context } from "hono";
import z from "zod";
import { logger } from "../../../helpers/logger.ts";
import {
	requireProjectOwner,
	type ProjectRouteVariables,
} from "../../../middleware/project-access-middleware.ts";
import {
	classifyGitError,
	configureProjectGit,
	disconnectProjectGit,
	syncProjectWithGit,
	type ProjectGitAction,
	type ProjectGitFailure,
} from "../../../projects/git-actions.ts";
import { getProjectGitConfig } from "../../../projects/git-sync.ts";
import { projectGitResolutionsSchema } from "../../../projects/git-input.ts";

const gitConfigSchema = z.object({
	folder: z
		.string()
		.trim()
		.max(1024)
		.default("")
		.refine(
			(value) =>
				value === "" ||
				value
					.split("/")
					.every((part) => /^[A-Za-z0-9_ -][A-Za-z0-9._ -]*$/.test(part) && part !== ".."),
			"Use a relative repository folder without hidden or parent directories",
		),
	remoteUrl: z
		.string()
		.trim()
		.max(2048)
		.url()
		.refine((value) => {
			const url = new URL(value);
			return url.protocol === "https:" && !url.username && !url.password;
		}, "Remote URL must be HTTPS and must not contain credentials")
		// Git paths are appended to the URL, so a query or fragment would swallow them.
		.refine(
			(value) => !value.includes("?") && !value.includes("#"),
			"Remote URL must not contain a query or fragment",
		),
	branch: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Invalid branch name")
		.refine(
			(value) =>
				value !== "HEAD" &&
				!value.includes("..") &&
				!value.includes("@{") &&
				!value.includes("//") &&
				!value.endsWith("/") &&
				!value.endsWith(".") &&
				!value.endsWith(".lock"),
		),
	username: z.string().trim().max(255).optional(),
	token: z.string().max(2048).optional(),
});

const gitPullSchema = z.object({
	resolutions: projectGitResolutionsSchema.optional(),
});

type GitRoutesEnv = { Variables: ProjectRouteVariables };

const app = new Hono<GitRoutesEnv>();

const failureStatus = {
	deleted: 404,
	forbidden: 403,
	busy: 409,
	"server-busy": 429,
	invalid: 400,
	"not-configured": 409,
	conflict: 409,
	rejected: 409,
	transport: 502,
} as const satisfies Record<ProjectGitFailure["kind"], number>;

function writeOnly(c: Context<GitRoutesEnv>) {
	return c.json({ error: "You do not have write access to this project" }, 403);
}

function failureResponse(c: Context<GitRoutesEnv>, failure: ProjectGitFailure) {
	const status = failureStatus[failure.kind];
	return failure.kind === "conflict"
		? c.json({ error: failure.message, conflicts: failure.conflicts }, status)
		: c.json({ error: failure.message }, status);
}

function logError(error: unknown) {
	return error instanceof Error ? { name: error.name, message: error.message } : error;
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
		return c.json(await configureProjectGit(settings));
	} catch (error) {
		const failure = classifyGitError(error);
		if (failure) {
			return failureResponse(c, failure);
		}
		logger.warn({ projectId, error: logError(error) }, "Saving Git settings failed");
		return c.json({ error: "Could not save Git settings" }, 500);
	}
});

app.delete("/:projectId/git", requireProjectOwner, async (c) => {
	const projectId = c.req.param("projectId")!;
	try {
		return c.json(await disconnectProjectGit(projectId));
	} catch (error) {
		const failure = classifyGitError(error);
		if (failure) {
			return failureResponse(c, failure);
		}
		throw error;
	}
});

async function runGitAction(c: Context<GitRoutesEnv>, action: ProjectGitAction) {
	if (c.get("projectAccess").readOnly) {
		return writeOnly(c);
	}

	const projectId = c.req.param("projectId")!;
	try {
		return c.json(await syncProjectWithGit(projectId, c.get("user")!.id, action));
	} catch (error) {
		const failure = classifyGitError(error);
		if (failure?.kind !== "busy" && failure?.kind !== "server-busy") {
			logger.warn(
				{ projectId, action: action.type, error: logError(error) },
				`Git ${action.type} failed`,
			);
		}
		return failure
			? failureResponse(c, failure)
			: c.json({ error: `Git ${action.type} failed` }, 500);
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
