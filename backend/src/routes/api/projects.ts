import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import { createProject, deleteProject, getProjectsByOwnerId } from "../../db/models/project.ts";
import z from "zod";
import { randomUUID } from "node:crypto";

const app = new Hono<{ Variables: HonoVariables }>();

const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(255),
});

app.get("/", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const ownedProjects = getProjectsByOwnerId(user.id);

	// To-Do: Project sharing

	return c.json({ projects: ownedProjects, sharedProjects: [] });
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

	const { name } = parseResult.data;

	const insertResult = createProject({
		id: randomUUID(),
		name,
		ownerId: user.id,
	});

	return c.json({ projectId: insertResult.lastInsertRowid });
});

app.delete("/:projectId", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const deleteResult = deleteProject(projectId, user.id);

	if (deleteResult.changes === 0) {
		return c.json({ error: "Project not found or you don't have permission to delete it" }, 404);
	}

	return c.json({ success: true });
});

export default app;
