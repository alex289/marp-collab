import { Hono } from "hono";
import type { HonoVariables } from "../types.ts";
import fileRouter from "./api/files.ts";
import collabRouter from "./api/collab.ts";
import authProvidersRouter from "./api/auth-providers.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/health", (c) => {
	return c.json({ ok: true });
});

app.route("/collab", collabRouter);
app.route("/files", fileRouter);
app.route("/auth-providers", authProvidersRouter);

export default app;
