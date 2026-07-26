import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import z from "zod";
import { createProject } from "../../../db/models/project.ts";
import { logger } from "../../../helpers/logger.ts";
import { importProjectFromZip } from "../../../projects/project-import.ts";
import { commitStagedProjectDirectory, deleteProjectDirectory } from "../../../projects/storage.ts";
import type { HonoVariables } from "../../../types.ts";
import { importProjectSchema } from "./schemas.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.post("/", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.parseBody();
	const parseResult = importProjectSchema.safeParse({ name: body.name });
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const uploadedFile = body.file;
	if (!(uploadedFile instanceof File)) {
		return c.json({ error: "No zip file provided" }, 400);
	}
	if (!uploadedFile.name.toLowerCase().endsWith(".zip")) {
		return c.json({ error: "File must be a .zip archive" }, 400);
	}

	const stagingId = `importing-${randomUUID()}`;
	// Tracks which dir to delete on failure
	let importedDirectoryId = stagingId;

	try {
		const zipData = new Uint8Array(await uploadedFile.arrayBuffer());
		await importProjectFromZip(stagingId, zipData);

		const projectId = randomUUID();
		await commitStagedProjectDirectory(stagingId, projectId);
		importedDirectoryId = projectId;
		createProject({ id: projectId, name: parseResult.data.name, ownerId: user.id });

		return c.json({ projectId });
	} catch (error) {
		try {
			await deleteProjectDirectory(importedDirectoryId);
		} catch (cleanupError) {
			logger.error(
				{ err: cleanupError, directoryId: importedDirectoryId },
				"Failed to clean up failed project import",
			);
		}

		logger.warn({ err: error }, "Project import failed");
		return c.json(
			{ error: error instanceof Error ? error.message : "Failed to import project" },
			400,
		);
	}
});

export default app;
