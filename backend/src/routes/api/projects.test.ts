import { describe, test, before, after } from "node:test";
import { equal, ok } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";

describe("projects routes", () => {
	let tempDir: string;
	let db: typeof import("../../db/db.ts").db;
	let app: Hono<{ Variables: HonoVariables }>;
	let files: typeof import("../../collab/files.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-projects-route-"));
		process.env.DATA_PATH = tempDir;

		const dbModule = await import("../../db/db.ts");
		const projectsRouter = (await import("./projects.ts")).default;
		const projectModel = await import("../../db/models/project.ts");
		files = await import("../../collab/files.ts");

		db = dbModule.db;
		const now = new Date().toISOString();
		db.prepare(
			"insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?)",
		).run("user-1", "Test User", "test@example.com", 1, now, now);
		projectModel.createProject({
			id: "upload-proj",
			name: "Upload Project",
			ownerId: "user-1",
		});
		await files.createProjectDir("upload-proj", "assets");

		app = new Hono<{ Variables: HonoVariables }>();
		app.use("*", async (c, next) => {
			c.set("user", { id: "user-1" } as HonoVariables["user"]);
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

	test("uploads a file into a destination folder", async () => {
		const formData = new FormData();
		formData.append("destination", "assets");
		formData.append(
			"file",
			new File(["section { color: red; }"], "Theme File.css", { type: "text/css" }),
		);

		const response = await app.request("/upload-proj/files/upload", {
			method: "POST",
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
			body: formData,
		});

		equal(response.status, 400);
		const body = (await response.json()) as { error?: string };
		equal(body.error, "Invalid upload destination");
	});
});
