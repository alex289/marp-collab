import { Hono } from "hono";
import z from "zod";
import { logger } from "../../../helpers/logger.ts";
import { provisionProjectFromZip } from "../../../projects/project-provisioning.ts";
import type { HonoVariables } from "../../../types.ts";
import { projectNameInput } from "./project-name-schema.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.post("/", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.parseBody();
	const parseResult = projectNameInput.safeParse({ name: body.name });
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

	try {
		const zipData = new Uint8Array(await uploadedFile.arrayBuffer());
		const projectId = await provisionProjectFromZip(
			{ name: parseResult.data.name, ownerId: user.id },
			zipData,
		);
		return c.json({ projectId });
	} catch (error) {
		logger.warn({ err: error }, "Project import failed");
		return c.json(
			{ error: error instanceof Error ? error.message : "Failed to import project" },
			400,
		);
	}
});

export default app;
