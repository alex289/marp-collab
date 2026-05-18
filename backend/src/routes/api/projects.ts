import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import { createProject, deleteProject, getProjectsByOwnerId } from "../../db/models/project.ts";
import { getUserProjectAccess } from "../../helpers/project-auth.ts";
import { getDeckFiles, saveDocumentContent, toDocumentName } from "../../collab/files.ts";
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
	const id = randomUUID();

	createProject({ id, name, ownerId: user.id });

	await saveDocumentContent(
		toDocumentName(id, "presentation.md"),
		`---\nmarp: true\n---\n\n# ${name}\n\n---\n\n## Slide 2\n`,
	);

	return c.json({ projectId: id });
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

app.get("/:projectId/files", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const deckFiles = await getDeckFiles(projectId);

	return c.json({
		files: deckFiles.map((file) => ({
			...file,
			documentName: toDocumentName(projectId, file.id),
		})),
	});
});

export default app;
