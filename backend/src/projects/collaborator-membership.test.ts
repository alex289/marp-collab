import { after, before, describe, test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "better-sqlite3";
import { registerProjectConnection, unregisterProjectConnection } from "../collab/connections.ts";

class CountingConnection {
	closeCalls = 0;

	close(): void {
		this.closeCalls += 1;
	}
}

describe("Collaborator Membership", () => {
	let tempDir: string;
	let db: Database;
	let membership: typeof import("./collaborator-membership.ts");

	function createProject(projectId: string): void {
		const now = new Date().toISOString();
		db.prepare(
			"insert into project (id, name, createdAt, updatedAt, ownerId) values (?, ?, ?, ?, ?)",
		).run(projectId, projectId, now, now, "membership-owner");
	}

	function addMembership(projectId: string, userId: string, readOnly: boolean): void {
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run(projectId, userId, readOnly ? 1 : 0, new Date().toISOString());
	}

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-membership-"));
		process.env.DATA_PATH = tempDir;
		const dbModule = await import("../db/db.ts");
		db = dbModule.db;
		const now = new Date().toISOString();
		for (const [id, name, email] of [
			["membership-owner", "Owner", "owner@example.com"],
			["membership-writer", "Writer", "writer@example.com"],
			["membership-target", "Target", "target@example.com"],
			["membership-outsider", "Outsider", "outsider@example.com"],
		]) {
			db.prepare(
				"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
			).run(id, name, email, 1, now, now);
		}
		membership = await import("./collaborator-membership.ts");
	});

	after(async () => {
		db.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("adds and lists a collaborator", () => {
		createProject("membership-add");
		deepEqual(
			membership.addProjectCollaborator({
				projectId: "membership-add",
				email: "target@example.com",
				readOnly: false,
			}),
			{ ok: true },
		);

		equal(membership.listProjectCollaborators("membership-add")[0]?.userId, "membership-target");
	});

	test("reports missing users and duplicate Membership", () => {
		createProject("membership-errors");
		deepEqual(
			membership.addProjectCollaborator({
				projectId: "membership-errors",
				email: "missing@example.com",
				readOnly: false,
			}),
			{ ok: false, reason: "user-not-found" },
		);
		addMembership("membership-errors", "membership-target", false);
		deepEqual(
			membership.addProjectCollaborator({
				projectId: "membership-errors",
				email: "target@example.com",
				readOnly: false,
			}),
			{ ok: false, reason: "already-collaborator" },
		);
	});

	test("closes connections when access changes", () => {
		createProject("membership-update");
		addMembership("membership-update", "membership-target", false);
		const connection = new CountingConnection();
		registerProjectConnection({
			socketId: "membership-update-socket",
			documentName: "project/membership-update/slides.md",
			userId: "membership-target",
			connection,
		});

		deepEqual(
			membership.updateProjectCollaborator({
				projectId: "membership-update",
				userId: "membership-target",
				readOnly: true,
			}),
			{ ok: true },
		);
		equal(connection.closeCalls, 1);
	});

	test("keeps connections open when access is unchanged", () => {
		createProject("membership-unchanged");
		addMembership("membership-unchanged", "membership-target", false);
		const connection = new CountingConnection();
		registerProjectConnection({
			socketId: "membership-unchanged-socket",
			documentName: "project/membership-unchanged/slides.md",
			userId: "membership-target",
			connection,
		});

		deepEqual(
			membership.updateProjectCollaborator({
				projectId: "membership-unchanged",
				userId: "membership-target",
				readOnly: false,
			}),
			{ ok: true },
		);
		equal(connection.closeCalls, 0);
		unregisterProjectConnection("membership-unchanged-socket");
	});

	test("closes connections when Membership is removed", () => {
		createProject("membership-remove");
		addMembership("membership-remove", "membership-target", false);
		const connection = new CountingConnection();
		registerProjectConnection({
			socketId: "membership-remove-socket",
			documentName: "project/membership-remove/slides.md",
			userId: "membership-target",
			connection,
		});

		deepEqual(
			membership.removeProjectCollaborator({
				projectId: "membership-remove",
				userId: "membership-target",
			}),
			{ ok: true },
		);
		equal(connection.closeCalls, 1);
	});
});
