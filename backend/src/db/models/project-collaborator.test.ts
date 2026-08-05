import { describe, test, before, after } from "node:test";
import { ok, equal, deepEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Database } from "better-sqlite3";

describe("project-collaborator model", () => {
	let tempDir: string;
	let db: Database;
	let models: typeof import("./project-collaborator.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-collab-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../db.ts");
		db = dbModule.db;

		const now = new Date().toISOString();
		db.prepare(
			"insert into user (id, name, email, emailVerified, image, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?, ?)",
		).run("owner-1", "Owner", "owner@example.com", 1, "owner.png", now, now);
		db.prepare(
			"insert into user (id, name, email, emailVerified, image, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?, ?)",
		).run("collab-1", "Collaborator", "collab@example.com", 1, "collaborator.png", now, now);
		db.prepare(
			"insert into project (id, name, createdAt, updatedAt, ownerId) values (?, ?, ?, ?, ?)",
		).run("proj-1", "Test Project", now, now, "owner-1");

		models = await import("./project-collaborator.ts");
	});

	after(async () => {
		db?.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("addCollaborator inserts and getCollaborator retrieves it", () => {
		models.addCollaborator("proj-1", "collab-1", false);
		const collab = models.getCollaborator("proj-1", "collab-1");
		ok(collab, "collaborator should exist");
		equal(collab!.projectId, "proj-1");
		equal(collab!.userId, "collab-1");
	});

	test("readOnly integer is deserialized as a boolean", () => {
		const collab = models.getCollaborator("proj-1", "collab-1");
		equal(typeof collab!.readOnly, "boolean");
		equal(collab!.readOnly, false);
	});

	test("sharedAt is deserialized as a Date object", () => {
		const collab = models.getCollaborator("proj-1", "collab-1");
		ok(collab!.sharedAt instanceof Date);
	});

	test("getCollaborator returns only Membership detail fields", () => {
		const collab = models.getCollaborator("proj-1", "collab-1");
		deepEqual(Object.keys(collab!).sort(), ["projectId", "readOnly", "sharedAt", "userId"]);
	});

	test("getCollaborator returns undefined for unknown pair", () => {
		equal(models.getCollaborator("proj-1", "nobody"), undefined);
		equal(models.getCollaborator("nobody", "collab-1"), undefined);
	});

	test("getCollaboratorsByProjectId returns collaborators for the project", () => {
		const collabs = models.getCollaboratorsByProjectId("proj-1");
		ok(collabs.some((c) => c.userId === "collab-1"));
	});

	test("getProjectOwnerByProjectId returns the stored owner profile", () => {
		deepEqual(models.getProjectOwnerByProjectId("proj-1"), {
			userId: "owner-1",
			userName: "Owner",
			userImage: "owner.png",
		});
	});

	test("getProjectOwnerByProjectId returns undefined for an unknown project", () => {
		equal(models.getProjectOwnerByProjectId("nobody"), undefined);
	});

	test("project collaboration details include stored user images", () => {
		const collab = models.getCollaboratorsByProjectId("proj-1")[0];
		equal(collab?.userImage, "collaborator.png");
	});

	test("getCollaboratorsByProjectId returns empty array for unknown project", () => {
		deepEqual(models.getCollaboratorsByProjectId("nobody"), []);
	});

	test("getCollaborationsByUserId returns projects the user collaborates on", () => {
		const collabs = models.getCollaborationsByUserId("collab-1");
		ok(collabs.some((c) => c.projectId === "proj-1"));
	});

	test("project collaboration details include the project timestamps", () => {
		const collab = models
			.getCollaborationsByUserId("collab-1")
			.find((entry) => entry.projectId === "proj-1");
		ok(collab?.projectCreatedAt instanceof Date);
		ok(collab?.updatedAt instanceof Date);
	});

	test("getCollaborationsByUserId returns empty array for unknown user", () => {
		deepEqual(models.getCollaborationsByUserId("nobody"), []);
	});

	test("updateCollaborator sets readOnly to true", () => {
		models.updateCollaborator("proj-1", "collab-1", true);
		equal(models.getCollaborator("proj-1", "collab-1")!.readOnly, true);
	});

	test("updateCollaborator sets readOnly back to false", () => {
		models.updateCollaborator("proj-1", "collab-1", false);
		equal(models.getCollaborator("proj-1", "collab-1")!.readOnly, false);
	});

	test("removeCollaborator deletes the collaborator", () => {
		models.addCollaborator("proj-1", "owner-1", true);
		models.removeCollaborator("proj-1", "owner-1");
		equal(models.getCollaborator("proj-1", "owner-1"), undefined);
	});
});
