import { describe, test, before, after } from "node:test";
import { ok, equal, throws } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database, { type Database as DatabaseConnection } from "better-sqlite3";
import { runMigrations } from "./migrations/index.ts";

describe("database initialization and migrations", () => {
	let tempDir: string;
	let db: DatabaseConnection;

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
		equal(version, 3);
	});

	test("creates all auth tables", () => {
		for (const table of [
			"user",
			"session",
			"account",
			"verification",
			"jwks",
			"oauthClient",
			"oauthResource",
			"oauthClientResource",
			"oauthRefreshToken",
			"oauthAccessToken",
			"oauthConsent",
			"oauthClientAssertion",
		]) {
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

	test("runMigrations is idempotent", () => {
		runMigrations(db);
		equal(db.pragma("user_version", { simple: true }), 3);
	});
});

test("a failed migration rolls back schema changes and leaves the database retryable", () => {
	const db = new Database(":memory:");
	try {
		db.exec('create table "oauthClient" ("id" text)');
		throws(() => runMigrations(db), /oauthClient.*already exists/);
		equal(db.pragma("user_version", { simple: true }), 0);
		equal(db.prepare("select name from sqlite_master where name = 'jwks'").get(), undefined);

		db.exec('drop table "oauthClient"');
		runMigrations(db);
		equal(db.pragma("user_version", { simple: true }), 3);
		ok(db.prepare("select name from sqlite_master where name = 'jwks'").get());
	} finally {
		db.close();
	}
});
