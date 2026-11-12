import { Hono } from "hono";
import type { HonoVariables } from "../types.ts";
import collabRouter from "./api/collab.ts";
import authProvidersRouter from "./api/auth-providers.ts";
import projectsRouter from "./api/projects.ts";
import { mcpConsentRouter } from "../mcp/routes.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/health", (c) => {
	return c.json({ ok: true });
});

app.route("/collab", collabRouter);
app.route("/auth-providers", authProvidersRouter);
app.route("/projects", projectsRouter);
app.route("/mcp", mcpConsentRouter);

export default app;
