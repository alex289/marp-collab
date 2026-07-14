import { Hono } from "hono";
import z from "zod";
import { getProjectAuthorization } from "../../../projects/access-policy.ts";
import {
	addProjectCollaborator,
	listProjectCollaborators,
	removeProjectCollaborator,
	updateProjectCollaborator,
} from "../../../projects/collaborator-membership.ts";
import type { HonoVariables } from "../../../types.ts";
import { addCollaboratorSchema, updateCollaboratorSchema } from "./schemas.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/:projectId/collaborators", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const result = listProjectCollaborators(projectId, user.id);
	if (!result.ok) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	return c.json({ collaborators: result.value });
});

app.post("/:projectId/collaborators", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const authorization = getProjectAuthorization(projectId, user.id, "manage");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	} else if (!authorization.allowed) {
		return c.json({ error: "Only the project owner can manage collaborators" }, 403);
	}

	const body = await c.req.json();
	const parseResult = addCollaboratorSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const result = addProjectCollaborator({
		projectId,
		actorUserId: user.id,
		email: parseResult.data.email,
		readOnly: parseResult.data.readOnly,
	});
	if (!result.ok && result.reason === "user-not-found") {
		return c.json({ error: "User with that email not found" }, 404);
	}
	if (!result.ok && result.reason === "already-collaborator") {
		return c.json({ error: "User is already a collaborator" }, 400);
	}
	if (!result.ok) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	return c.json({ success: true });
});

app.patch("/:projectId/collaborators/:userId", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId, userId } = c.req.param();

	const authorization = getProjectAuthorization(projectId, user.id, "manage");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	} else if (!authorization.allowed) {
		return c.json({ error: "Only the project owner can manage collaborators" }, 403);
	}

	const body = await c.req.json();
	const parseResult = updateCollaboratorSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const result = updateProjectCollaborator({
		projectId,
		actorUserId: user.id,
		userId,
		readOnly: parseResult.data.readOnly,
	});
	if (!result.ok && result.reason === "collaborator-not-found") {
		return c.json({ error: "Collaborator not found" }, 404);
	}
	if (!result.ok) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	return c.json({ success: true });
});

app.delete("/:projectId/collaborators/:userId", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId, userId } = c.req.param();

	const result = removeProjectCollaborator({
		projectId,
		actorUserId: user.id,
		userId,
	});
	if (!result.ok && result.reason === "access-denied") {
		return c.json({ error: "Project not found or access denied" }, 403);
	} else if (!result.ok) {
		return c.json({ error: "Only the project owner can manage collaborators" }, 403);
	}

	return c.json({ success: true });
});

export default app;
