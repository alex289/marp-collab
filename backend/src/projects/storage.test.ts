import { describe, test, before, after } from "node:test";
import { ok, equal, deepEqual, rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Readable } from "node:stream";

async function readAll(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

describe("project storage", () => {
	let tempDir: string;
	let files: typeof import("./storage.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-files-"));
		process.env.DATA_PATH = tempDir;
		files = await import("./storage.ts");
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
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

		test("reads stored bytes without exposing a filesystem path", async () => {
			await files.saveProjectFile("ops-proj", "asset.bin", new Uint8Array([1, 2, 3]));
			deepEqual(Array.from((await files.readProjectFile("ops-proj", "asset.bin"))!), [1, 2, 3]);
			equal(await files.readProjectFile("ops-proj", "missing.bin"), undefined);
			equal(await files.readProjectFile("ops-proj", "../escape.bin"), undefined);
		});

		test("opens a stored file as a readable stream", async () => {
			await files.saveProjectFile("ops-proj", "stream.txt", new TextEncoder().encode("streamed"));
			const stream = await files.openProjectFile("ops-proj", "stream.txt");
			ok(stream);
			equal((await readAll(stream)).toString("utf8"), "streamed");
			equal(await files.openProjectFile("ops-proj", "missing.txt"), undefined);
		});
	});

	describe("createProjectZipStream", () => {
		test("includes regular files and excludes Yjs companion files", async () => {
			await files.saveDocumentContent("project/zip-proj/slides.md", "# Slides");
			await files.saveDocumentBinary("project/zip-proj/slides.md", new Uint8Array([1, 2, 3]));
			await files.saveProjectFile("zip-proj", "assets/logo.txt", new TextEncoder().encode("logo"));

			const archive = await readAll(await files.createProjectZipStream("zip-proj"));
			const contents = archive.toString("latin1");
			ok(contents.includes("slides.md"));
			ok(contents.includes("assets/logo.txt"));
			ok(!contents.includes("slides.md.yjs"));
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

		test("moves the Yjs companion file with the document", async () => {
			await files.saveDocumentContent("project/move-yjs-proj/slides.md", "text");
			await files.saveDocumentBinary("project/move-yjs-proj/slides.md", new Uint8Array([7, 8]));
			await files.createProjectDir("move-yjs-proj", "archive");

			equal(
				await files.moveProjectFile("move-yjs-proj", "slides.md", "archive"),
				"archive/slides.md",
			);
			equal(await files.getDocumentBinary("project/move-yjs-proj/slides.md"), undefined);
			deepEqual(
				Array.from((await files.getDocumentBinary("project/move-yjs-proj/archive/slides.md"))!),
				[7, 8],
			);
		});

		test("returns null for a path traversal source", async () => {
			equal(await files.moveProjectFile("ops-proj", "../escape.md", ""), null);
		});
	});

	describe("renameProjectFile", () => {
		test("renames a file within the same folder and preserves content", async () => {
			await files.saveDocumentContent("project/rename-proj/source.md", "rename me");
			const newId = await files.renameProjectFile("rename-proj", "source.md", "renamed.md");

			equal(newId, "renamed.md");
			equal(await files.getDocumentContent("project/rename-proj/source.md"), undefined);
			equal(await files.getDocumentContent("project/rename-proj/renamed.md"), "rename me");
		});

		test("renames a nested file without changing its parent folder", async () => {
			await files.saveDocumentContent("project/rename-proj/folder/source.md", "nested");
			const newId = await files.renameProjectFile("rename-proj", "folder/source.md", "renamed.md");

			equal(newId, "folder/renamed.md");
			equal(await files.getDocumentContent("project/rename-proj/folder/renamed.md"), "nested");
		});

		test("renames the .yjs companion file when it exists", async () => {
			await files.saveDocumentContent("project/rename-proj/with-yjs.md", "text");
			await files.saveDocumentBinary("project/rename-proj/with-yjs.md", new Uint8Array([4, 5, 6]));

			const newId = await files.renameProjectFile("rename-proj", "with-yjs.md", "renamed-yjs.md");

			equal(newId, "renamed-yjs.md");
			equal(await files.getDocumentBinary("project/rename-proj/with-yjs.md"), undefined);
			deepEqual(
				Array.from((await files.getDocumentBinary("project/rename-proj/renamed-yjs.md"))!),
				[4, 5, 6],
			);
		});

		test("returns null for names containing slashes or traversal", async () => {
			await files.saveDocumentContent("project/rename-proj/invalid-name.md", "x");

			equal(await files.renameProjectFile("rename-proj", "invalid-name.md", "bad/name.md"), null);
			equal(await files.renameProjectFile("rename-proj", "invalid-name.md", "../bad.md"), null);
			equal(await files.renameProjectFile("rename-proj", "invalid-name.md", "bad..name.md"), null);
		});

		test("returns null for unsupported file extensions", async () => {
			await files.saveDocumentContent("project/rename-proj/file.md", "x");

			equal(await files.renameProjectFile("rename-proj", "file.md", "file.exe"), null);
		});

		test("returns null when destination already exists", async () => {
			await files.saveDocumentContent("project/rename-proj/collision-source.md", "source");
			await files.saveDocumentContent("project/rename-proj/collision-dest.md", "dest");

			equal(
				await files.renameProjectFile("rename-proj", "collision-source.md", "collision-dest.md"),
				null,
			);
			equal(await files.getDocumentContent("project/rename-proj/collision-source.md"), "source");
			equal(await files.getDocumentContent("project/rename-proj/collision-dest.md"), "dest");
		});
	});

	describe("renameProjectFolder", () => {
		test("renames a folder and preserves nested files", async () => {
			await files.createProjectDir("rename-folder-proj", "old-folder");
			await files.saveDocumentContent("project/rename-folder-proj/old-folder/file.md", "nested");

			const newPath = await files.renameProjectFolder(
				"rename-folder-proj",
				"old-folder",
				"new-folder",
			);

			equal(newPath, "new-folder");
			equal(
				await files.getDocumentContent("project/rename-folder-proj/new-folder/file.md"),
				"nested",
			);
			equal(
				await files.getDocumentContent("project/rename-folder-proj/old-folder/file.md"),
				undefined,
			);
		});

		test("renames a nested folder without changing its parent folder", async () => {
			await files.createProjectDir("rename-folder-proj", "parent/old-child");
			await files.saveDocumentContent(
				"project/rename-folder-proj/parent/old-child/file.md",
				"nested",
			);

			const newPath = await files.renameProjectFolder(
				"rename-folder-proj",
				"parent/old-child",
				"new-child",
			);

			equal(newPath, "parent/new-child");
			equal(
				await files.getDocumentContent("project/rename-folder-proj/parent/new-child/file.md"),
				"nested",
			);
		});

		test("returns null for invalid folder names and destination collisions", async () => {
			await files.createProjectDir("rename-folder-proj", "source-folder");
			await files.createProjectDir("rename-folder-proj", "existing-folder");

			equal(
				await files.renameProjectFolder("rename-folder-proj", "source-folder", "bad/name"),
				null,
			);
			equal(await files.renameProjectFolder("rename-folder-proj", "source-folder", "../bad"), null);
			equal(
				await files.renameProjectFolder("rename-folder-proj", "source-folder", "existing-folder"),
				null,
			);
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
