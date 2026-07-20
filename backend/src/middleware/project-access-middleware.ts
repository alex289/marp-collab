import { createMiddleware } from "hono/factory";
import { getProjectAccess, type ProjectAccess } from "../projects/access-policy.ts";
import type { HonoVariables } from "../types.ts";

export type ProjectRouteVariables = HonoVariables & {
	projectAccess: ProjectAccess;
};

type ProjectRouteEnvironment = {
	Variables: ProjectRouteVariables;
};

export const requireProjectAccess = createMiddleware<ProjectRouteEnvironment>(async (c, next) => {
	const projectId = c.req.param("projectId");
	if (!projectId) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	// Asset tokens are used for access to project assets from sandboxed iframes
	if (c.get("assetTokenProjectId") === projectId) {
		c.set("projectAccess", { isOwner: false, readOnly: true });
		await next();
		return;
	}

	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const access = getProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	c.set("projectAccess", access);
	await next();
});

export const requireProjectWriteAccess = createMiddleware<ProjectRouteEnvironment>(
	async (c, next) => {
		if (c.get("projectAccess").readOnly) {
			return c.json({ error: "You do not have write access to this project" }, 403);
		}

		await next();
	},
);

export const requireProjectOwner = createMiddleware<ProjectRouteEnvironment>(async (c, next) => {
	if (!c.get("projectAccess").isOwner) {
		return c.json({ error: "Only the project owner can manage collaborators" }, 403);
	}

	await next();
});
