import { Hono } from "hono";
import type { HonoVariables } from "../types.ts";
import fileRouter from "./api/files.ts";
import collabRouter from "./api/collab.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/health", (c) => {
	return c.json({ ok: true });
});

app.route("/collab", collabRouter);
app.route("/files", fileRouter);

export default app;
