import { after, before, describe, test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { Database } from "better-sqlite3";
import type { HonoVariables } from "../types.ts";
import type { ProjectAccess } from "../projects/access-policy.ts";

type TestVariables = HonoVariables & { projectAccess: ProjectAccess };

describe("Project Access Middleware", () => {
	let tempDir: string;
	let db: Database;
	let app: Hono<{ Variables: TestVariables }>;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-project-access-middleware-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../db/db.ts");
		const middleware = await import("./project-access-middleware.ts");
		db = dbModule.db;

		const now = new Date().toISOString();
		for (const [id, name, email] of [
			["middleware-owner", "Owner", "middleware-owner@example.com"],
			["middleware-writer", "Writer", "middleware-writer@example.com"],
			["middleware-reader", "Reader", "middleware-reader@example.com"],
			["middleware-outsider", "Outsider", "middleware-outsider@example.com"],
		]) {
			db.prepare(
				"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
			).run(id, name, email, 1, now, now);
		}
		db.prepare(
			"insert into project (id, name, createdAt, updatedAt, ownerId) values (?, ?, ?, ?, ?)",
		).run("middleware-project", "Middleware Project", now, now, "middleware-owner");
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("middleware-project", "middleware-writer", 0, now);
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("middleware-project", "middleware-reader", 1, now);

		app = new Hono<{ Variables: TestVariables }>();
		app.use("*", async (c, next) => {
			const userId = c.req.header("x-test-user-id");
			c.set(
				"user",
				userId
					? ({ id: userId, name: userId, email: `${userId}@example.com` } as HonoVariables["user"])
					: null,
			);
			c.set("session", null);
			await next();
		});
		app.use("/:projectId/*", middleware.requireProjectAccess);
		app.get("/:projectId/files", (c) => c.json(c.get("projectAccess")));
		app.post("/:projectId/files", middleware.requireProjectWriteAccess, (c) =>
			c.json({ success: true }),
		);
		app.delete("/:projectId/collaborators/:userId", middleware.requireProjectOwner, (c) =>
			c.json({ success: true }),
		);
	});

	after(async () => {
		db.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("rejects missing users and project access before handlers", async () => {
		const unauthenticated = await app.request("/middleware-project/files");
		equal(unauthenticated.status, 401);
		deepEqual(await unauthenticated.json(), { error: "Unauthorized" });

		const outsider = await app.request("/middleware-project/files", {
			headers: { "x-test-user-id": "middleware-outsider" },
		});
		equal(outsider.status, 403);
		deepEqual(await outsider.json(), { error: "Project not found or access denied" });
	});

	test("caches Project Access for downstream handlers", async () => {
		const response = await app.request("/middleware-project/files", {
			headers: { "x-test-user-id": "middleware-reader" },
		});
		equal(response.status, 200);
		deepEqual(await response.json(), { isOwner: false, readOnly: true });
	});

	test("uses cached readOnly and owner flags for mutations", async () => {
		const readOnly = await app.request("/middleware-project/files", {
			method: "POST",
			headers: { "x-test-user-id": "middleware-reader" },
		});
		equal(readOnly.status, 403);
		deepEqual(await readOnly.json(), { error: "You do not have write access to this project" });

		const writer = await app.request("/middleware-project/files", {
			method: "POST",
			headers: { "x-test-user-id": "middleware-writer" },
		});
		equal(writer.status, 200);

		const nonOwner = await app.request("/middleware-project/collaborators/middleware-reader", {
			method: "DELETE",
			headers: { "x-test-user-id": "middleware-writer" },
		});
		equal(nonOwner.status, 403);
		deepEqual(await nonOwner.json(), {
			error: "Only the project owner can manage collaborators",
		});

		const owner = await app.request("/middleware-project/collaborators/middleware-reader", {
			method: "DELETE",
			headers: { "x-test-user-id": "middleware-owner" },
		});
		equal(owner.status, 200);
	});
});
