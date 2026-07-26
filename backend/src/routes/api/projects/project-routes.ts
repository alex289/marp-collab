import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import z from "zod";
import {
	createProject,
	deleteProject,
	getProjectById,
	getProjectsByOwnerId,
	updateProject,
} from "../../../db/models/project.ts";
import { getCollaborationsByUserId } from "../../../db/models/project-collaborator.ts";
import { getProjectAuthorization } from "../../../projects/access-policy.ts";
import { seedProjectFromTemplate } from "../../../projects/project-templates.ts";
import type { HonoVariables } from "../../../types.ts";
import { createProjectSchema, updateProjectSchema } from "./schemas.ts";
import { deleteProjectDirectory } from "../../../projects/storage.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const ownedProjects = getProjectsByOwnerId(user.id);
	const sharedProjects = getCollaborationsByUserId(user.id);

	return c.json({ projects: ownedProjects, sharedProjects: sharedProjects });
});

app.post("/", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.json();
	const parseResult = createProjectSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const { name, template } = parseResult.data;
	const id = randomUUID();

	createProject({ id, name, ownerId: user.id });

	await seedProjectFromTemplate(id, template, name, user.name ?? "Unknown Author");

	return c.json({ projectId: id });
});

app.get("/:projectId", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const authorization = getProjectAuthorization(projectId, user.id, "read");
	if (!authorization.allowed) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const project = getProjectById(projectId);
	if (!project) {
		return c.json({ error: "Project not found" }, 404);
	}

	return c.json({ project, isOwner: authorization.access.isOwner });
});

app.patch("/:projectId", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const authorization = getProjectAuthorization(projectId, user.id, "manage");
	if (!authorization.allowed) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const body = await c.req.json();
	const parseResult = updateProjectSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	updateProject({ id: projectId, name: parseResult.data.name });

	return c.json({ success: true });
});

app.delete("/:projectId", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const authorization = getProjectAuthorization(projectId, user.id, "manage");
	if (!authorization.allowed) {
		return c.json({ error: "Project not found or you don't have permission to delete it" }, 404);
	}

	await deleteProjectDirectory(projectId);

	const deleteResult = deleteProject(projectId, user.id);
	if (deleteResult.changes === 0) {
		return c.json({ error: "Project not found or you don't have permission to delete it" }, 404);
	}

	return c.json({ success: true });
});

export default app;
