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
import { authorizeProject } from "../../../projects/access-policy.ts";
import { toDocumentName } from "../../../projects/document-identity.ts";
import { saveDocumentContent } from "../../../projects/storage.ts";
import type { HonoVariables } from "../../../types.ts";
import { createProjectSchema, updateProjectSchema } from "./schemas.ts";

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

function createDefaultPresentationMarkdown(name: string, authorName: string) {
	return `---
marp: true
size: 16:9
title: ${name}
description: A Marp presentation
keywords: Presentation, ${name}
author: ${authorName}
theme: default
paginate: true
---

# ${name}

---

## Slide 2
`;
}

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
		createDefaultPresentationMarkdown(name, user.name ?? ""),
	);

	return c.json({ projectId: id });
});

app.get("/:projectId", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const authorization = authorizeProject(projectId, user.id, "read");
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

	const authorization = authorizeProject(projectId, user.id, "manage-collaborators");
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
