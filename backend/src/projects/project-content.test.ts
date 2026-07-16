import { after, before, describe, test } from "node:test";
import { deepEqual } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Project Content", () => {
	let tempDir: string;
	let content: typeof import("./project-content.ts");
	let storage: typeof import("./storage.ts");
	let collab: typeof import("../collab/hocuspocus.ts");
	let messages: string[];

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-project-content-"));
		process.env.DATA_PATH = tempDir;
		[content, storage, collab] = await Promise.all([
			import("./project-content.ts"),
			import("./storage.ts"),
			import("../collab/hocuspocus.ts"),
		]);
	});

	after(async () => {
		collab.collabServer.documents.clear();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	function recordProjectEvents(projectId: string): void {
		messages = [];
		collab.collabServer.documents.clear();
		collab.collabServer.documents.set(`project/${projectId}/open.md`, {
			broadcastStateless(message: string) {
				messages.push(message);
			},
		} as never);
	}

	function expectSingleEvent(): void {
		deepEqual(messages, ["files-changed"]);
		messages.length = 0;
	}

	test("creates editable content and lists public content entries", async () => {
		recordProjectEvents("content-create");

		deepEqual(await content.createEditableProjectFile("content-create", "notes.md"), {
			id: "notes.md",
			label: "notes.md",
			type: "markdown",
			documentName: "project/content-create/notes.md",
		});
		expectSingleEvent();

		await content.createProjectFolder("content-create", "assets");
		expectSingleEvent();

		deepEqual(
			await content.saveBinaryProjectFile(
				"content-create",
				"assets/logo.png",
				new Uint8Array([1, 2, 3]),
			),
			{ id: "assets/logo.png", label: "assets/logo.png", type: "asset" },
		);
		expectSingleEvent();

		deepEqual(await content.listProjectContent("content-create"), [
			{ id: "assets", label: "assets", type: "folder" },
			{ id: "assets/logo.png", label: "assets/logo.png", type: "asset" },
			{
				id: "notes.md",
				label: "notes.md",
				type: "markdown",
				documentName: "project/content-create/notes.md",
			},
		]);
	});

	test("saves editable and binary uploads with one event each", async () => {
		recordProjectEvents("content-save");

		deepEqual(await content.saveEditableProjectFile("content-save", "theme.css", "body {}"), {
			id: "theme.css",
			label: "theme.css",
			type: "markdown",
			documentName: "project/content-save/theme.css",
		});
		expectSingleEvent();

		deepEqual(
			await content.saveBinaryProjectFile("content-save", "font.woff2", new Uint8Array([4, 5])),
			{ id: "font.woff2", label: "font.woff2", type: "asset" },
		);
		expectSingleEvent();
	});

	test("renames and moves files and folders with one event only after success", async () => {
		recordProjectEvents("content-rename");
		await storage.saveDocumentContent("project/content-rename/slides.md", "# Deck");
		await storage.createProjectDir("content-rename", "archive/old");

		deepEqual(await content.renameProjectContentFile("content-rename", "slides.md", "deck.md"), {
			ok: true,
			id: "deck.md",
		});
		expectSingleEvent();

		deepEqual(await content.moveProjectContentFile("content-rename", "deck.md", "archive"), {
			ok: true,
			id: "archive/deck.md",
		});
		expectSingleEvent();

		deepEqual(await content.renameProjectContentFolder("content-rename", "archive/old", "new"), {
			ok: true,
			id: "archive/new",
		});
		expectSingleEvent();

		deepEqual(await content.renameProjectContentFile("content-rename", "missing.md", "new.md"), {
			ok: false,
		});
		deepEqual(await content.moveProjectContentFile("content-rename", "../missing.md", "archive"), {
			ok: false,
		});
		deepEqual(await content.renameProjectContentFolder("content-rename", "missing", "new"), {
			ok: false,
		});
		deepEqual(messages, []);
	});

	test("deletes files and folders with one event only after success", async () => {
		recordProjectEvents("content-delete");
		await storage.saveDocumentContent("project/content-delete/remove.md", "remove");
		await storage.createProjectDir("content-delete", "folder");

		deepEqual(await content.deleteProjectContentFile("content-delete", "remove.md"), { ok: true });
		expectSingleEvent();

		deepEqual(await content.deleteProjectContentFolder("content-delete", "folder"), { ok: true });
		expectSingleEvent();

		deepEqual(await content.deleteProjectContentFile("content-delete", "missing.md"), {
			ok: false,
		});
		deepEqual(await content.deleteProjectContentFolder("content-delete", "missing"), { ok: false });
		deepEqual(messages, []);
	});
});
