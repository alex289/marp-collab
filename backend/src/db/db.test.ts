import { describe, test, before, after } from "node:test";
import { ok, equal } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Database } from "better-sqlite3";

describe("database initialization and migrations", () => {
	let tempDir: string;
	let db: Database;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-db-"));
		process.env.DATA_PATH = tempDir;
		// Dynamic import so DATA_PATH is set before db.ts initializes
		const module = await import("./db.ts");
		db = module.db;
	});

	after(async () => {
		db?.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("user_version equals number of applied migrations", () => {
		const version = db.pragma("user_version", { simple: true });
		equal(version, 2);
	});

	test("creates all auth tables", () => {
		for (const table of ["user", "session", "account", "verification"]) {
			const row = db
				.prepare("select name from sqlite_master where type='table' and name=?")
				.get(table);
			ok(row, `table '${table}' should exist`);
		}
	});

	test("creates project and project_collaborator tables", () => {
		for (const table of ["project", "project_collaborator"]) {
			const row = db
				.prepare("select name from sqlite_master where type='table' and name=?")
				.get(table);
			ok(row, `table '${table}' should exist`);
		}
	});

	test("creates expected indexes", () => {
		for (const idx of ["session_userId_idx", "account_userId_idx", "verification_identifier_idx"]) {
			const row = db
				.prepare("select name from sqlite_master where type='index' and name=?")
				.get(idx);
			ok(row, `index '${idx}' should exist`);
		}
	});

	test("enables WAL journal mode", () => {
		equal(db.pragma("journal_mode", { simple: true }), "wal");
	});

	test("enables foreign key enforcement", () => {
		equal(db.pragma("foreign_keys", { simple: true }), 1);
	});

	test("runMigrations is idempotent", async () => {
		const { runMigrations } = await import("./migrations/index.ts");
		runMigrations();
		equal(db.pragma("user_version", { simple: true }), 2);
	});
});
