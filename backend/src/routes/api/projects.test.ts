import { describe, test, before, after } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";

describe("projects routes", () => {
	let tempDir: string;
	let db: typeof import("../../db/db.ts").db;
	let app: Hono<{ Variables: HonoVariables }>;
	let files: typeof import("../../projects/storage.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-projects-route-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../../db/db.ts");
		const projectsRouter = (await import("./projects.ts")).default;
		const projectModel = await import("../../db/models/project.ts");
		files = await import("../../projects/storage.ts");

		db = dbModule.db;
		const now = new Date().toISOString();
		db.prepare(
			"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
		).run("user-1", "Test User", "test@example.com", 1, now, now);
		for (const [id, name, email] of [
			["route-writer", "Route Writer", "route-writer@example.com"],
			["route-reader", "Route Reader", "route-reader@example.com"],
			["route-outsider", "Route Outsider", "route-outsider@example.com"],
		]) {
			db.prepare(
				"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
			).run(id, name, email, 1, now, now);
		}
		projectModel.createProject({
			id: "upload-proj",
			name: "Upload Project",
			ownerId: "user-1",
		});
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("upload-proj", "route-writer", 0, now);
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("upload-proj", "route-reader", 1, now);
		await files.createProjectDir("upload-proj", "assets");

		app = new Hono<{ Variables: HonoVariables }>();
		app.use("*", async (c, next) => {
			const userId = c.req.header("x-test-user-id");
			c.set(
				"user",
				userId
					? ({
							id: userId,
							name: userId,
							email: `${userId}@example.com`,
						} as HonoVariables["user"])
					: null,
			);
			c.set("session", null);
			await next();
		});
		app.route("/", projectsRouter);
	});

	after(async () => {
		db?.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("creates a project with the default template", async () => {
		const response = await app.request("/", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-test-user-id": "user-1",
			},
			body: JSON.stringify({ name: "Default Project" }),
		});

		equal(response.status, 200);
		const body = (await response.json()) as { projectId: string };
		ok(body.projectId);

		const markdown = await files.getDocumentContent(`project/${body.projectId}/presentation.md`);
		ok(markdown?.includes("theme: default"));

		const deckFiles = await files.getDeckFiles(body.projectId);
		ok(!deckFiles.some((file) => file.id.startsWith("theme/")));
	});

	test("creates a project with the whs template, seeding theme assets", async () => {
		const response = await app.request("/", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-test-user-id": "user-1",
			},
			body: JSON.stringify({ name: "WHS Project", template: "whs" }),
		});

		equal(response.status, 200);
		const body = (await response.json()) as { projectId: string };
		ok(body.projectId);

		const markdown = await files.getDocumentContent(`project/${body.projectId}/presentation.md`);
		ok(markdown?.includes("theme: whs"));

		const css = await files.getDocumentContent(`project/${body.projectId}/theme/whs.css`);
		ok(css?.includes("@theme whs"));

		const deckFiles = await files.getDeckFiles(body.projectId);
		ok(deckFiles.some((file) => file.id === "theme/logo.svg"));
	});

	test("rejects an unknown template value", async () => {
		const response = await app.request("/", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-test-user-id": "user-1",
			},
			body: JSON.stringify({ name: "Bad Template Project", template: "does-not-exist" }),
		});

		equal(response.status, 400);
	});

	test("uploads a file into a destination folder", async () => {
		const formData = new FormData();
		formData.append("destination", "assets");
		formData.append(
			"file",
			new File(["section { color: red; }"], "Theme File.css", { type: "text/css" }),
		);

		const response = await app.request("/upload-proj/files/upload", {
			method: "POST",
			headers: { "x-test-user-id": "user-1" },
			body: formData,
		});

		equal(response.status, 200);
		const body = (await response.json()) as {
			file: { id: string; label: string; type: string; documentName?: string };
		};
		equal(body.file.id, "assets/theme-file.css");
		equal(body.file.label, "assets/theme-file.css");
		equal(body.file.type, "markdown");
		equal(body.file.documentName, "project/upload-proj/assets/theme-file.css");
		equal(
			await files.getDocumentContent("project/upload-proj/assets/theme-file.css"),
			"section { color: red; }",
		);

		const deckFiles = await files.getDeckFiles("upload-proj");
		ok(deckFiles.some((file) => file.id === "assets/theme-file.css"));
	});

	test("rejects an upload destination with unsupported characters", async () => {
		const formData = new FormData();
		formData.append("destination", "bad:*");
		formData.append("file", new File(["# Bad"], "bad.md", { type: "text/markdown" }));

		const response = await app.request("/upload-proj/files/upload", {
			method: "POST",
			headers: { "x-test-user-id": "user-1" },
			body: formData,
		});

		equal(response.status, 400);
		const body = (await response.json()) as { error?: string };
		equal(body.error, "Invalid upload destination");
	});

	test("rejects an unauthenticated file listing", async () => {
		const response = await app.request("/upload-proj/files");
		equal(response.status, 401);
		deepEqual(await response.json(), { error: "Unauthorized" });
	});

	test("allows a read-only collaborator to list files", async () => {
		const response = await app.request("/upload-proj/files", {
			headers: { "x-test-user-id": "route-reader" },
		});
		equal(response.status, 200);
	});

	test("rejects a read-only collaborator creating a file", async () => {
		const response = await app.request("/upload-proj/files", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-test-user-id": "route-reader",
			},
			body: JSON.stringify({ name: "blocked.md" }),
		});
		equal(response.status, 403);
		deepEqual(await response.json(), {
			error: "You do not have write access to this project",
		});
	});

	test("distinguishes a collaborator from an outsider when managing collaborators", async () => {
		const collaboratorResponse = await app.request("/upload-proj/collaborators", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-test-user-id": "route-writer",
			},
			body: JSON.stringify({ email: "route-outsider@example.com", readOnly: false }),
		});
		equal(collaboratorResponse.status, 403);
		deepEqual(await collaboratorResponse.json(), {
			error: "Only the project owner can manage collaborators",
		});

		const outsiderResponse = await app.request("/upload-proj/collaborators", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-test-user-id": "route-outsider",
			},
			body: JSON.stringify({ email: "route-reader@example.com", readOnly: false }),
		});
		equal(outsiderResponse.status, 403);
		deepEqual(await outsiderResponse.json(), {
			error: "Project not found or access denied",
		});
	});
});
