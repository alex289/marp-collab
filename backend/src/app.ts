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

const app = new Hono<{ Variables: HonoVariables }>();

app.use(timeout(30 * 1000)); // 30 seconds
app.use(trimTrailingSlash());
app.use(secureHeaders());
app.use((c, next) => {
	// Prevent search engines from indexing any page
	c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
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

app.on(["GET", "POST"], "/api/v1/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

app.use("/api/*", async (c, next) => {
	// Routes without authentication
	if (
		c.req.path.startsWith("/api/v1/auth/") ||
		c.req.path.startsWith("/api/v1/health") ||
		c.req.path === "/api/v1/auth-providers"
	) {
		return next();
	}

	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	c.set("user", session.user);
	c.set("session", session.session);
	await next();
});

app.route("/api/v1", apiRouter);

// oxlint-disable-next-line require-await
app.use("/api/*", async (c) => {
	return c.json({ error: "Not Found" }, 404);
});

// Production: serve static frontend files
if (!isDev()) {
	// Redirect /index.html to clean URL
	app.get("/index.html", (c) => c.redirect("/", 301));

	// Serve static files from ./frontend
	app.use(
		"*",
		serveStatic({
			root: "./frontend",
			precompressed: true,
			onFound: (_path, c) => {
				const hasExtension = extname(c.req.path) !== "";

				// Dot not cache non hashed service worker files
				const isServiceWorkerFile = c.req.path === "/sw.js" || c.req.path === "/registerSW.js";

				if (hasExtension && !isServiceWorkerFile) {
					c.header("Cache-Control", `private, immutable, max-age=86400`);
				} else {
					// Extensionless requests resolve to index.html (SPA routes, "/").
					// It must always be revalidated so it never points at stale
					// (deleted) hashed asset filenames from a previous deploy.
					c.header("Cache-Control", "no-cache");
				}
			},
		}),
	);

	// SPA fallback: serve index.html for all unmatched routes
	app.get("*", serveStatic({ root: "./frontend", path: "index.html", precompressed: true }));
}

app.onError((err, c) => {
	// Handle known HTTP exceptions
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status);
	}

	logger.error(err);

	// Do not expose internal error details
	return c.json({ error: "Internal Server Error" }, 500);
});

const wss = new WebSocketServer({ noServer: true });

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
