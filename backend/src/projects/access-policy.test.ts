import { after, before, describe, test } from "node:test";
import { deepEqual } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "better-sqlite3";

describe("Project Access Policy", () => {
	let tempDir: string;
	let db: Database;
	let accessPolicy: typeof import("./access-policy.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-access-policy-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../db/db.ts");
		db = dbModule.db;
		const now = new Date().toISOString();
		for (const [id, name, email] of [
			["access-owner", "Owner", "owner@example.com"],
			["access-writer", "Writer", "writer@example.com"],
			["access-reader", "Reader", "reader@example.com"],
			["access-outsider", "Outsider", "outsider@example.com"],
		]) {
			db.prepare(
				"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
			).run(id, name, email, 1, now, now);
		}
		db.prepare(
			"insert into project (id, name, createdAt, updatedAt, ownerId) values (?, ?, ?, ?, ?)",
		).run("access-project", "Access Project", now, now, "access-owner");
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("access-project", "access-writer", 0, now);
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("access-project", "access-reader", 1, now);

		accessPolicy = await import("./access-policy.ts");
	});

	after(async () => {
		db.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("allows the owner to manage collaborators", () => {
		deepEqual(accessPolicy.getProjectAuthorization("access-project", "access-owner", "manage"), {
			allowed: true,
			access: { isOwner: true, readOnly: false },
		});
	});

	test("allows a read-write collaborator to write", () => {
		deepEqual(accessPolicy.getProjectAuthorization("access-project", "access-writer", "write"), {
			allowed: true,
			access: { isOwner: false, readOnly: false },
		});
	});

	test("allows a read-only collaborator to read", () => {
		deepEqual(accessPolicy.getProjectAuthorization("access-project", "access-reader", "read"), {
			allowed: true,
			access: { isOwner: false, readOnly: true },
		});
	});

	test("distinguishes read-only write denial", () => {
		deepEqual(accessPolicy.getProjectAuthorization("access-project", "access-reader", "write"), {
			allowed: false,
			reason: "read-only",
		});
	});

	test("distinguishes non-owner management denial", () => {
		deepEqual(accessPolicy.getProjectAuthorization("access-project", "access-writer", "manage"), {
			allowed: false,
			reason: "not-owner",
		});
	});

	test("returns no-access for outsiders and missing Projects", () => {
		deepEqual(accessPolicy.getProjectAuthorization("access-project", "access-outsider", "read"), {
			allowed: false,
			reason: "no-access",
		});
		deepEqual(accessPolicy.getProjectAuthorization("missing-project", "access-owner", "read"), {
			allowed: false,
			reason: "no-access",
		});
	});
});
