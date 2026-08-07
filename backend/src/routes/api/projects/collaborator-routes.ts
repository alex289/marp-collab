import { Hono } from "hono";
import z from "zod";
import { getProjectOwnerByProjectId } from "../../../db/models/project-collaborator.ts";
import {
	addProjectCollaborator,
	listProjectCollaborators,
	removeProjectCollaborator,
	updateProjectCollaborator,
} from "../../../projects/collaborator-membership.ts";
import {
	requireProjectOwner,
	type ProjectRouteVariables,
} from "../../../middleware/project-access-middleware.ts";
import { addCollaboratorSchema, updateCollaboratorSchema } from "./schemas.ts";

const app = new Hono<{ Variables: ProjectRouteVariables }>();

app.get("/:projectId/collaborators", (c) => {
	const { projectId } = c.req.param();
	const owner = getProjectOwnerByProjectId(projectId);
	if (!owner) {
		return c.json({ error: "Project not found" }, 404);
	}

	return c.json({ owner, collaborators: listProjectCollaborators(projectId) });
});

app.post("/:projectId/collaborators", requireProjectOwner, async (c) => {
	const { projectId } = c.req.param();

	const body = await c.req.json();
	const parseResult = addCollaboratorSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const result = addProjectCollaborator({
		projectId,
		email: parseResult.data.email,
		readOnly: parseResult.data.readOnly,
	});
	if (!result.ok && result.reason === "user-not-found") {
		return c.json({ error: "User with that email not found" }, 404);
	}
	if (!result.ok && result.reason === "already-collaborator") {
		return c.json({ error: "User is already a collaborator" }, 400);
	}
	return c.json({ success: true });
});

app.patch("/:projectId/collaborators/:userId", requireProjectOwner, async (c) => {
	const { projectId, userId } = c.req.param();

	const body = await c.req.json();
	const parseResult = updateCollaboratorSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const result = updateProjectCollaborator({
		projectId,
		userId,
		readOnly: parseResult.data.readOnly,
	});
	if (!result.ok && result.reason === "collaborator-not-found") {
		return c.json({ error: "Collaborator not found" }, 404);
	}
	return c.json({ success: true });
});

app.delete("/:projectId/collaborators/:userId", requireProjectOwner, (c) => {
	const { projectId, userId } = c.req.param();

	removeProjectCollaborator({
		projectId,
		userId,
	});

	return c.json({ success: true });
});

export default app;
