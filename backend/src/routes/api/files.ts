import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import { getDeckFiles, toDocumentName } from "../../collab/files.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/", async (c) => {
	const deckFiles = await getDeckFiles();

	return c.json({
		files: deckFiles.map((file) => ({
			...file,
			documentName: toDocumentName(file.id),
		})),
	});
});

export default app;
