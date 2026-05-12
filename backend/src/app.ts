import { serve, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { auth } from "./auth.ts";
import { deckFiles, toDocumentName } from "./collab/files.ts";
import { createCollabServer } from "./collab/hocuspocus.ts";
import { timeout } from "hono/timeout";
import { trimTrailingSlash } from "hono/trailing-slash";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";
import { isDev } from "./helpers/isDev.ts";
import { runMigrations } from "./migrations/index.ts";
import type { AppVariables } from "./types.ts";
import { WebSocketServer } from "ws";

runMigrations();

const app = new Hono<{ Variables: AppVariables }>();

app.use(timeout(30 * 1000)); // 30 seconds
app.use(trimTrailingSlash());
app.use(secureHeaders());
app.use(
	bodyLimit({
		maxSize: 10 * 1024 * 1024, // 10 MB
		onError: (c) => {
			return c.text("Body is too large", { status: 413 });
		},
	}),
);
app.use(compress());

app.use("*", async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session) {
		c.set("user", null);
		c.set("session", null);
		await next();
		return;
	}

	c.set("user", session.user);
	c.set("session", session.session);
	await next();
});

app.on(["GET", "POST"], "/api/v1/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

app.get("/api/v1/health", (c) => {
	return c.json({ ok: true });
});

app.get("/api/v1/session", (c) => {
	return c.json({
		user: c.get("user"),
		session: c.get("session"),
	});
});

app.get("/api/v1/files", (c) => {
	return c.json({
		files: deckFiles.map((file) => ({
			...file,
			documentName: toDocumentName(file.id),
		})),
	});
});

app.get("/", (c) => c.text("Marp realtime backend is running."));

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
			onFound: (path, c) => {
				if (path !== "/" && path !== "/index.html") {
					c.header("Cache-Control", `private, immutable, max-age=86400`);
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

	console.error("Unexpected error:", err);

	// Do not expose internal error details
	return c.json({ error: "Internal Server Error" }, 500);
});

const collabServer = createCollabServer();

app.get(
	"/api/v1/collab",
	upgradeWebSocket((c) => {
		let clientConnection: ReturnType<typeof collabServer.handleConnection> | undefined;
		return {
			onOpen(_evt, ws) {
				if (!ws.raw) {
					throw new Error("WebSocket upgrade failed, raw WebSocket not available");
				}
				ws.raw.binaryType = "arraybuffer";
				clientConnection = collabServer.handleConnection(ws.raw, c.req.raw, {});
			},
			onMessage(evt) {
				clientConnection?.handleMessage(new Uint8Array(evt.data));
			},
			onClose() {
				clientConnection?.handleClose();
			},
		};
	}),
);

const wss = new WebSocketServer({ noServer: true });

serve(
	{
		fetch: app.fetch,
		port: Number(process.env.PORT ?? 8787),
		hostname: process.env.HOSTNAME ?? undefined,
		websocket: { server: wss },
	},
	(info) => {
		collabServer.hooks("onListen", {
			instance: collabServer,
			configuration: collabServer.configuration,
			port: info.port,
		});
		console.log(`Listening on http://localhost:${info.port} (HTTP + WebSocket)`);
	},
);
