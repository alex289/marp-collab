import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import collaboratorRoutes from "./projects/collaborator-routes.ts";
import contentRoutes from "./projects/content-routes.ts";
import exportRoutes from "./projects/export-routes.ts";
import projectRoutes from "./projects/project-routes.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.route("/", projectRoutes);
app.route("/", collaboratorRoutes);
app.route("/", exportRoutes);
app.route("/", contentRoutes);

export default app;
