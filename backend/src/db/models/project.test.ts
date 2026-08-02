import { describe, test, before, after } from "node:test";
import { ok, equal, deepEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Database } from "better-sqlite3";

describe("project model", () => {
	let tempDir: string;
	let db: Database;
	let models: typeof import("./project.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-project-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../db.ts");
		db = dbModule.db;

		const now = new Date().toISOString();
		db.prepare(
			"insert into user (id, name, email, emailVerified, image, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?, ?)",
		).run("user-1", "Test User", "test@example.com", 1, "owner.png", now, now);

		models = await import("./project.ts");
	});

	after(async () => {
		db?.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("createProject inserts a project retrievable by id", () => {
		models.createProject({ id: "proj-1", name: "Test Project", ownerId: "user-1" });
		const project = models.getProjectById("proj-1");
		ok(project, "project should exist");
		equal(project!.id, "proj-1");
		equal(project!.name, "Test Project");
		equal(project!.ownerId, "user-1");
		equal(project!.ownerName, "Test User");
		equal(project!.ownerImage, "owner.png");
	});

	test("getProjectById returns undefined for unknown id", () => {
		equal(models.getProjectById("nonexistent"), undefined);
	});

	test("createdAt and updatedAt are deserialized as Date objects", () => {
		const project = models.getProjectById("proj-1");
		ok(project!.createdAt instanceof Date);
		ok(project!.updatedAt instanceof Date);
	});

	test("getProjectsByOwnerId returns all projects for an owner", () => {
		models.createProject({ id: "proj-2", name: "Second Project", ownerId: "user-1" });
		const projects = models.getProjectsByOwnerId("user-1");
		ok(projects.some((p) => p.id === "proj-1"));
		ok(projects.some((p) => p.id === "proj-2"));
	});

	test("getProjectsByOwnerId returns projects ordered by createdAt descending", () => {
		const projects = models.getProjectsByOwnerId("user-1");
		for (let i = 1; i < projects.length; i++) {
			ok(projects[i - 1]!.createdAt >= projects[i]!.createdAt);
		}
	});

	test("getProjectsByOwnerId returns empty array for unknown owner", () => {
		deepEqual(models.getProjectsByOwnerId("nobody"), []);
	});

	test("updateProject changes the project name", () => {
		models.updateProject({ id: "proj-1", name: "Renamed" });
		equal(models.getProjectById("proj-1")!.name, "Renamed");
	});

	test("deleteProject removes the project when ownerId matches", () => {
		models.createProject({ id: "proj-del", name: "Delete Me", ownerId: "user-1" });
		models.deleteProject("proj-del", "user-1");
		equal(models.getProjectById("proj-del"), undefined);
	});

	test("deleteProject leaves project intact when ownerId does not match", () => {
		models.createProject({ id: "proj-keep", name: "Keep Me", ownerId: "user-1" });
		models.deleteProject("proj-keep", "wrong-owner");
		ok(models.getProjectById("proj-keep"), "project should still exist");
	});
});
