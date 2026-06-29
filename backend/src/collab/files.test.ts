import { describe, test, before, after } from "node:test";
import { ok, equal, deepEqual, rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("collab/files", () => {
	let tempDir: string;
	let files: typeof import("./files.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-files-"));
		process.env.DATA_PATH = tempDir;
		files = await import("./files.ts");
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	describe("toDocumentName", () => {
		test("combines project id and file id", () => {
			equal(files.toDocumentName("proj-1", "slides.md"), "project/proj-1/slides.md");
		});

		test("handles nested file ids", () => {
			equal(files.toDocumentName("abc", "sub/dir/file.css"), "project/abc/sub/dir/file.css");
		});
	});

	describe("isMarkdownFileId", () => {
		test("returns true for .md extension", () => {
			equal(files.isMarkdownFileId("slides.md"), true);
		});

		test("returns true for .markdown extension (case-insensitive)", () => {
			equal(files.isMarkdownFileId("README.MARKDOWN"), true);
		});

		test("returns false for .css", () => {
			equal(files.isMarkdownFileId("styles.css"), false);
		});

		test("returns false for image and other extensions", () => {
			equal(files.isMarkdownFileId("photo.jpg"), false);
			equal(files.isMarkdownFileId("noextension"), false);
		});
	});

	describe("resolveProjectFilePath", () => {
		test("returns a path string for valid inputs", () => {
			const result = files.resolveProjectFilePath("proj-1", "slides.md");
			ok(result !== null);
			ok(result!.includes("proj-1"));
			ok(result!.includes("slides.md"));
		});

		test("returns null for invalid project id (spaces)", () => {
			equal(files.resolveProjectFilePath("invalid id!", "slides.md"), null);
		});

		test("returns null for empty project id", () => {
			equal(files.resolveProjectFilePath("", "slides.md"), null);
		});

		test("returns null for empty file id", () => {
			equal(files.resolveProjectFilePath("proj-1", ""), null);
		});

		test("returns null for absolute file path", () => {
			equal(files.resolveProjectFilePath("proj-1", "/etc/passwd"), null);
		});

		test("returns null for single-segment path traversal", () => {
			equal(files.resolveProjectFilePath("proj-1", "../escape.md"), null);
		});

		test("returns null for nested path traversal", () => {
			equal(files.resolveProjectFilePath("proj-1", "sub/../../escape.md"), null);
		});
	});

	describe("getDocumentContent / saveDocumentContent", () => {
		test("returns undefined for an invalid document name format", async () => {
			equal(await files.getDocumentContent("not-a-valid-name"), undefined);
		});

		test("returns undefined for a non-existent file", async () => {
			equal(await files.getDocumentContent("project/proj-text/nonexistent.md"), undefined);
		});

		test("roundtrip: save then retrieve text content", async () => {
			await files.saveDocumentContent("project/proj-text/slides.md", "# Hello World");
			equal(await files.getDocumentContent("project/proj-text/slides.md"), "# Hello World");
		});

		test("overwrites existing content on second save", async () => {
			await files.saveDocumentContent("project/proj-text/update.md", "first");
			await files.saveDocumentContent("project/proj-text/update.md", "second");
			equal(await files.getDocumentContent("project/proj-text/update.md"), "second");
		});

		test("throws on path traversal in document name", async () => {
			await rejects(
				() => files.getDocumentContent("project/proj-text/../../escape.md"),
				/Invalid presentation file id/,
			);
		});
	});

	describe("getDocumentBinary / saveDocumentBinary", () => {
		test("returns undefined when the .yjs file does not exist", async () => {
			equal(await files.getDocumentBinary("project/proj-binary/slides.md"), undefined);
		});

		test("roundtrip: save then retrieve binary data", async () => {
			const data = new Uint8Array([0, 1, 2, 255]);
			await files.saveDocumentBinary("project/proj-binary/slides.md", data);
			const result = await files.getDocumentBinary("project/proj-binary/slides.md");
			ok(result instanceof Uint8Array);
			deepEqual(Array.from(result!), [0, 1, 2, 255]);
		});
	});

	describe("getDeckFiles", () => {
		test("returns empty array for a project with no files", async () => {
			deepEqual(await files.getDeckFiles("empty-proj"), []);
		});

		test("lists files sorted alphabetically by id", async () => {
			await files.saveDocumentContent("project/sorted-proj/b.md", "b");
			await files.saveDocumentContent("project/sorted-proj/a.md", "a");
			const result = await files.getDeckFiles("sorted-proj");
			deepEqual(
				result.map((f) => f.id),
				["a.md", "b.md"],
			);
		});

		test("excludes .yjs binary files", async () => {
			await files.saveDocumentContent("project/filter-proj/slides.md", "content");
			await files.saveDocumentBinary("project/filter-proj/slides.md", new Uint8Array([1]));
			const result = await files.getDeckFiles("filter-proj");
			ok(!result.some((f) => f.id.endsWith(".yjs")));
		});

		test("classifies .md files as markdown type", async () => {
			await files.saveDocumentContent("project/typed-proj/slides.md", "content");
			const result = await files.getDeckFiles("typed-proj");
			const md = result.find((f) => f.id === "slides.md");
			ok(md);
			equal(md!.type, "markdown");
		});

		test("classifies folders with type folder", async () => {
			await files.createProjectDir("folder-typed-proj", "assets");
			const result = await files.getDeckFiles("folder-typed-proj");
			const folder = result.find((f) => f.id === "assets");
			ok(folder);
			equal(folder!.type, "folder");
		});
	});

	describe("createProjectDir", () => {
		test("creates a subdirectory visible in getDeckFiles", async () => {
			await files.createProjectDir("mkdir-proj", "images");
			const deck = await files.getDeckFiles("mkdir-proj");
			ok(deck.some((f) => f.id === "images" && f.type === "folder"));
		});

		test("throws for an invalid project id", async () => {
			await rejects(() => files.createProjectDir("invalid id!", "assets"), /Invalid project id/);
		});

		test("throws for an absolute directory path", async () => {
			await rejects(() => files.createProjectDir("mkdir-proj", "/absolute"), /Invalid dir path/);
		});

		test("throws for a path traversal attempt", async () => {
			await rejects(() => files.createProjectDir("mkdir-proj", "../escape"), /Invalid dir path/);
		});
	});

	describe("saveProjectFile", () => {
		test("writes a file readable via getDocumentContent", async () => {
			const data = new TextEncoder().encode("file content");
			await files.saveProjectFile("ops-proj", "doc.md", data);
			equal(await files.getDocumentContent("project/ops-proj/doc.md"), "file content");
		});

		test("throws for an invalid file path", async () => {
			await rejects(
				() => files.saveProjectFile("ops-proj", "../escape.md", new Uint8Array()),
				/Invalid project file path/,
			);
		});
	});

	describe("moveProjectFile", () => {
		test("moves the file and returns the new file id", async () => {
			await files.saveDocumentContent("project/ops-proj/source.md", "move me");
			await files.createProjectDir("ops-proj", "subdir");
			const newId = await files.moveProjectFile("ops-proj", "source.md", "subdir");
			equal(newId, "subdir/source.md");
			equal(await files.getDocumentContent("project/ops-proj/subdir/source.md"), "move me");
		});

		test("moves a file to the project root when destination is empty string", async () => {
			await files.saveDocumentContent("project/ops-proj/subdir/back.md", "back");
			const newId = await files.moveProjectFile("ops-proj", "subdir/back.md", "");
			equal(newId, "back.md");
		});

		test("returns null for a path traversal source", async () => {
			equal(await files.moveProjectFile("ops-proj", "../escape.md", ""), null);
		});
	});

	describe("deleteProjectFile", () => {
		test("returns true and removes the file", async () => {
			await files.saveDocumentContent("project/ops-proj/to-delete.md", "bye");
			equal(await files.deleteProjectFile("ops-proj", "to-delete.md"), true);
			equal(await files.getDocumentContent("project/ops-proj/to-delete.md"), undefined);
		});

		test("returns false for a file that does not exist", async () => {
			equal(await files.deleteProjectFile("ops-proj", "nonexistent.md"), false);
		});

		test("returns false for a path traversal attempt", async () => {
			equal(await files.deleteProjectFile("ops-proj", "../escape.md"), false);
		});
	});

	describe("deleteProjectFolder", () => {
		test("returns true and removes the folder and its contents", async () => {
			await files.createProjectDir("ops-proj", "to-remove");
			await files.saveDocumentContent("project/ops-proj/to-remove/file.md", "x");
			equal(await files.deleteProjectFolder("ops-proj", "to-remove"), true);
			equal(await files.getDocumentContent("project/ops-proj/to-remove/file.md"), undefined);
		});

		test("returns false for a folder that does not exist", async () => {
			equal(await files.deleteProjectFolder("ops-proj", "no-such-folder"), false);
		});
	});
});
