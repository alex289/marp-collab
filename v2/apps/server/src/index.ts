import "dotenv/config";
import { serve } from "@hono/node-server";
import type { Server as HttpServer } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth, type AuthSession } from "./auth.js";
import { deckFiles, toDocumentName } from "./files.js";
import { attachCollabServer, createCollabServer } from "./hocuspocus.js";

type AppVariables = {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
};

const app = new Hono<{ Variables: AppVariables }>();

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const httpPort = Number(process.env.PORT ?? 8787);

app.use(
  "/api/*",
  cors({
    origin: webOrigin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

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

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});

app.get("/api/session", (c) => {
  return c.json({
    user: c.get("user"),
    session: c.get("session"),
  });
});

app.get("/api/files", (c) => {
  return c.json({
    files: deckFiles.map((file) => ({
      ...file,
      documentName: toDocumentName(file.id),
    })),
  });
});

app.get("/", (c) => c.text("Marp realtime backend is running."));

const httpServer = serve(
  {
    fetch: app.fetch,
    port: httpPort,
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port} (HTTP + WebSocket)`);
  },
);

const collabServer = createCollabServer();
attachCollabServer(collabServer, httpServer as unknown as HttpServer);
