import { after, before, describe, test } from "node:test";
import { equal } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { HonoVariables } from "../types.ts";

describe("apiAuthMiddleware", () => {
	let tempDir: string;
	let db: typeof import("../db/db.ts").db;
	let app: Hono<{ Variables: HonoVariables }>;
	let signAssetToken: typeof import("../helpers/asset-token.ts").signAssetToken;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-api-auth-middleware-"));
		process.env.DATA_PATH = tempDir;
		process.env.AUTH_SECRET = "test-secret";

		// Importing db.ts runs migrations, which auth.ts (imported by the
		// middleware) needs a real database connection for.
		db = (await import("../db/db.ts")).db;
		const assetToken = await import("../helpers/asset-token.ts");
		signAssetToken = assetToken.signAssetToken;
		const { apiAuthMiddleware } = await import("./api-auth-middleware.ts");

		app = new Hono<{ Variables: HonoVariables }>();
		app.use("/api/*", apiAuthMiddleware);
		app.get("/api/v1/health", (c) => c.json({ ok: true }));
		app.get("/api/v1/auth-providers", (c) => c.json({ ok: true }));
		app.get("/api/v1/projects/:projectId/files", (c) => c.json({ ok: true }));
		app.get("/api/v1/projects/:projectId/files/:fileId{.+}", (c) =>
			c.json({ assetTokenProjectId: c.get("assetTokenProjectId") ?? null }),
		);
		app.delete("/api/v1/projects/:projectId/files/:fileId{.+}", (c) =>
			c.json({ assetTokenProjectId: c.get("assetTokenProjectId") ?? null }),
		);
	});

	after(async () => {
		db.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
		delete process.env.AUTH_SECRET;
	});

	test("allows public routes without a session or token", async () => {
		equal((await app.request("/api/v1/health")).status, 200);
		equal((await app.request("/api/v1/auth-providers")).status, 200);
	});

	test("rejects the file-listing route without a session, even with a valid token", async () => {
		const token = signAssetToken("project-1");
		const response = await app.request(`/api/v1/projects/project-1/files?token=${token}`);
		equal(response.status, 401);
	});

	test("accepts a valid asset token on the file-download route without a session", async () => {
		const token = signAssetToken("project-1");
		const response = await app.request(`/api/v1/projects/project-1/files/image.png?token=${token}`);
		equal(response.status, 200);
		equal((await response.json()).assetTokenProjectId, "project-1");
	});

	test("rejects a token scoped to a different project than the URL", async () => {
		const token = signAssetToken("project-1");
		const response = await app.request(`/api/v1/projects/project-2/files/image.png?token=${token}`);
		equal(response.status, 401);
	});

	test("rejects a valid token on non-GET requests to the file-download route", async () => {
		const token = signAssetToken("project-1");
		const response = await app.request(
			`/api/v1/projects/project-1/files/image.png?token=${token}`,
			{ method: "DELETE" },
		);
		equal(response.status, 401);
	});

	test("rejects requests with no session and no token", async () => {
		const response = await app.request("/api/v1/projects/project-1/files/image.png");
		equal(response.status, 401);
	});
});
