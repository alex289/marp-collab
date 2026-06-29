import { describe, test, before, after } from "node:test";
import { equal, deepEqual } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Database } from "better-sqlite3";

describe("getUserProjectAccess", () => {
	let tempDir: string;
	let db: Database;
	let projectAuth: typeof import("./project-auth.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-project-auth-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../db/db.ts");
		db = dbModule.db;

		const now = new Date().toISOString();
		db.prepare(
			"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
		).run("pa-owner", "Owner", "owner@example.com", 1, now, now);
		db.prepare(
			"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
		).run("pa-collab-rw", "Collab RW", "rw@example.com", 1, now, now);
		db.prepare(
			"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
		).run("pa-collab-ro", "Collab RO", "ro@example.com", 1, now, now);
		db.prepare(
			"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
		).run("pa-outsider", "Outsider", "out@example.com", 1, now, now);
		db.prepare(
			"insert into project (id, name, createdAt, updatedAt, ownerId) values (?, ?, ?, ?, ?)",
		).run("pa-proj", "Auth Test Project", now, now, "pa-owner");
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("pa-proj", "pa-collab-rw", 0, now);
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("pa-proj", "pa-collab-ro", 1, now);

		projectAuth = await import("./project-auth.ts");
	});

	after(async () => {
		db?.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("returns undefined when the project does not exist", () => {
		equal(projectAuth.getUserProjectAccess("nonexistent-proj", "pa-owner"), undefined);
	});

	test("returns owner access for the project owner", () => {
		deepEqual(projectAuth.getUserProjectAccess("pa-proj", "pa-owner"), {
			isOwner: true,
			readOnly: false,
		});
	});

	test("returns read-write collaborator access", () => {
		deepEqual(projectAuth.getUserProjectAccess("pa-proj", "pa-collab-rw"), {
			isOwner: false,
			readOnly: false,
		});
	});

	test("returns read-only collaborator access", () => {
		deepEqual(projectAuth.getUserProjectAccess("pa-proj", "pa-collab-ro"), {
			isOwner: false,
			readOnly: true,
		});
	});

	test("returns undefined for a user with no access to the project", () => {
		equal(projectAuth.getUserProjectAccess("pa-proj", "pa-outsider"), undefined);
	});
});
