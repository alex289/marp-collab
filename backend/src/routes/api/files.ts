import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import { deckFiles, toDocumentName } from "../../collab/files.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/", (c) => {
	return c.json({
		files: deckFiles.map((file) => ({
			...file,
			documentName: toDocumentName(file.id),
		})),
	});
});

export default app;
