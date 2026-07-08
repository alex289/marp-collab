import { after, before, describe, test } from "node:test";
import { equal, ok } from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import type { Database } from "better-sqlite3";
import type { HonoVariables } from "../../types.ts";

describe("projects API", () => {
	let tempDir: string;
	let db: Database;
	let files: typeof import("../../collab/files.ts");
	let projectsRoute: typeof import("./projects.ts");
	let pdfExport: typeof import("../../collab/pdf-export.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-projects-api-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../../db/db.ts");
		db = dbModule.db;
		files = await import("../../collab/files.ts");
		projectsRoute = await import("./projects.ts");
		pdfExport = await import("../../collab/pdf-export.ts");

		const now = new Date().toISOString();
		for (const [id, email] of [
			["api-owner", "owner@example.com"],
			["api-readonly", "readonly@example.com"],
			["api-outsider", "outsider@example.com"],
		]) {
			db.prepare(
				"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
			).run(id, id, email, 1, now, now);
		}
		db.prepare(
			"insert into project (id, name, createdAt, updatedAt, ownerId) values (?, ?, ?, ?, ?)",
		).run("api-proj", "Route Export", now, now, "api-owner");
		db.prepare(
			"insert into project_collaborator (projectId, userId, readOnly, createdAt) values (?, ?, ?, ?)",
		).run("api-proj", "api-readonly", 1, now);

		await files.saveDocumentContent(
			files.toDocumentName("api-proj", "presentation.md"),
			"---\nmarp: true\n---\n\n# Route Export",
		);
		await files.saveProjectFile("api-proj", "logo.png", new Uint8Array([1, 2, 3]));
	});

	after(async () => {
		db?.close();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	function createUser(userId: string): NonNullable<HonoVariables["user"]> {
		return {
			id: userId,
			name: userId,
			email: `${userId}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	function createTestApp(
		userId: string | null,
		createDeckPdfFile: NonNullable<
			Parameters<typeof projectsRoute.createProjectsRouter>[0]
		>["createDeckPdfFile"],
	) {
		const app = new Hono<{ Variables: HonoVariables }>();
		app.use("*", async (c, next) => {
			c.set("session", null);
			c.set("user", userId ? createUser(userId) : null);
			await next();
		});
		app.route("/projects", projectsRoute.createProjectsRouter({ createDeckPdfFile }));
		return app;
	}

	test("rejects PDF export without a session user", async () => {
		const app = createTestApp(null, () => Promise.reject(new Error("should not export")));

		const res = await app.request("/projects/api-proj/export.pdf?file=presentation.md");

		equal(res.status, 401);
	});

	test("rejects PDF export when file query is missing", async () => {
		const app = createTestApp("api-owner", () => Promise.reject(new Error("should not export")));

		const res = await app.request("/projects/api-proj/export.pdf");
		const body = (await res.json()) as { error: string };

		equal(res.status, 400);
		equal(body.error, "Missing selected deck file");
	});

	test("rejects PDF export for users without project access", async () => {
		const app = createTestApp("api-outsider", () => Promise.reject(new Error("should not export")));

		const res = await app.request("/projects/api-proj/export.pdf?file=presentation.md");

		equal(res.status, 403);
	});

	test("rejects PDF export for non-Markdown selected files", async () => {
		const app = createTestApp("api-owner", () =>
			Promise.reject(new pdfExport.PdfExportError(400, "Selected file must be a Markdown deck")),
		);

		const res = await app.request("/projects/api-proj/export.pdf?file=logo.png");
		const body = (await res.json()) as { error: string };

		equal(res.status, 400);
		equal(body.error, "Selected file must be a Markdown deck");
	});

	test("maps missing selected Markdown files to 404", async () => {
		const app = createTestApp("api-owner", () =>
			Promise.reject(new pdfExport.PdfExportError(404, "Selected deck not found")),
		);

		const res = await app.request("/projects/api-proj/export.pdf?file=missing.md");
		const body = (await res.json()) as { error: string };

		equal(res.status, 404);
		equal(body.error, "Selected deck not found");
	});

	test("streams a PDF for read-only collaborators and cleans up", async () => {
		const pdfPath = join(tempDir, "fake.pdf");
		await writeFile(pdfPath, "%PDF-1.4\n");
		let selectedFileId = "";
		let cleanupCalled = false;
		const app = createTestApp("api-readonly", (_projectId: string, fileId: string) => {
			selectedFileId = fileId;
			return Promise.resolve({
				path: pdfPath,
				filename: "presentation.pdf",
				cleanup: () => {
					cleanupCalled = true;
					return Promise.resolve();
				},
			});
		});

		const res = await app.request("/projects/api-proj/export.pdf?file=presentation.md");
		const body = await res.text();

		equal(res.status, 200);
		equal(selectedFileId, "presentation.md");
		equal(res.headers.get("content-type"), "application/pdf");
		ok(res.headers.get("content-disposition")?.includes("presentation.pdf"));
		equal(res.headers.get("cache-control"), "no-store");
		equal(body, "%PDF-1.4\n");
		equal(cleanupCalled, true);
	});
});
