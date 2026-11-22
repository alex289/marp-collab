import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { auth } from "./auth.ts";
import { timeout } from "hono/timeout";
import { trimTrailingSlash } from "hono/trailing-slash";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";
import { extname } from "node:path";
import { isDev } from "./helpers/isDev.ts";
import type { HonoVariables } from "./types.ts";
import { WebSocketServer } from "ws";
import { logger } from "./helpers/logger.ts";
import apiRouter from "./routes/api.ts";
import { collabServer } from "./collab/hocuspocus.ts";
import { apiAuthMiddleware } from "./middleware/api-auth-middleware.ts";
import { mcpRouter } from "./mcp/routes.ts";
import { cors } from "hono/cors";

const app = new Hono<{ Variables: HonoVariables }>();

app.use(timeout(30 * 1000));
app.use(trimTrailingSlash());
// secureHeaders writes after the route handler. Set the CORP default earlier so the asset route can override it.
app.use(secureHeaders({ crossOriginResourcePolicy: false }));
app.use((c, next) => {
	c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
	c.header("Cross-Origin-Resource-Policy", "same-origin");
	return next();
});

const maxBodySizeMb = Number(process.env.MAX_BODY_SIZE_MB ?? 200);
app.use(
	bodyLimit({
		maxSize: maxBodySizeMb * 1024 * 1024,
		onError: (c) => {
			return c.text("Body is too large", { status: 413 });
		},
	}),
);
app.use(compress());

app.use("/mcp", bodyLimit({ maxSize: 4 * 1024 * 1024 }));
// Browser MCP clients need to read OAuth challenge and DPoP nonce headers.
app.use(
	"/mcp",
	cors({
		origin: "*",
		exposeHeaders: ["WWW-Authenticate", "MCP-Protocol-Version", "DPoP-Nonce"],
		allowMethods: ["POST", "OPTIONS"],
	}),
);
app.use("/.well-known/*", cors({ origin: "*" }));
app.route("/", mcpRouter);

app.on(["GET", "POST"], "/api/v1/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

app.use("/api/*", apiAuthMiddleware);

app.route("/api/v1", apiRouter);

// oxlint-disable-next-line require-await
app.use("/api/*", async (c) => {
	return c.json({ error: "Not Found" }, 404);
});

if (!isDev()) {
	app.get("/index.html", (c) => c.redirect("/", 301));

	app.use(
		"*",
		serveStatic({
			root: "./frontend",
			precompressed: true,
			onFound: (_path, c) => {
				const hasExtension = extname(c.req.path) !== "";

				const isServiceWorkerFile = c.req.path === "/sw.js" || c.req.path === "/registerSW.js";

				if (hasExtension && !isServiceWorkerFile) {
					c.header("Cache-Control", `private, immutable, max-age=86400`);
				} else {
					// Revalidate the app shell and service workers so they pick up each deployment's hashed assets.
					c.header("Cache-Control", "no-cache");
				}
			},
		}),
	);

	// Client-side routes need the app shell when no static file matches.
	app.get("*", serveStatic({ root: "./frontend", path: "index.html", precompressed: true }));
}

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status);
	}

	logger.error(err);

	return c.json({ error: "Internal Server Error" }, 500);
});

const wss = new WebSocketServer({ noServer: true });
// An unhandled WebSocket server error would throw synchronously.
wss.on("error", (err) => {
	logger.error(err, "WebSocket server error");
});

serve(
	{
		fetch: app.fetch,
		port: Number(process.env.PORT ?? 8787),
		hostname: process.env.HOSTNAME ?? undefined,
		websocket: { server: wss },
	},
	async (info) => {
		await collabServer.hooks("onListen", {
			instance: collabServer,
			configuration: collabServer.configuration,
			port: info.port,
		});
		logger.info(`Listening on http://localhost:${info.port}`);
	},
);
