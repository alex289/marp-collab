import { Hono } from "hono";
import collaboratorRoutes from "./projects/collaborator-routes.ts";
import contentRoutes from "./projects/content-routes.ts";
import exportRoutes from "./projects/export-routes.ts";
import {
	requireProjectAccess,
	type ProjectRouteVariables,
} from "./projects/project-access-middleware.ts";
import projectRoutes from "./projects/project-routes.ts";

const app = new Hono<{ Variables: ProjectRouteVariables }>();

app.use("/:projectId/*", requireProjectAccess);

app.route("/", projectRoutes);
app.route("/", collaboratorRoutes);
app.route("/", exportRoutes);
app.route("/", contentRoutes);

export default app;
