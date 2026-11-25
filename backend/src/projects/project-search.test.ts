import { after, before, describe, test } from "node:test";
import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("project global search and replace", () => {
	let tempDir: string;
	let storage: typeof import("./storage.ts");
	let collabServer: typeof import("../collab/hocuspocus.ts").collabServer;
	let projectOperations: typeof import("./project-operations.ts");
	let projectSearch: typeof import("./project-search.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-project-search-"));
		process.env.DATA_PATH = tempDir;
		storage = await import("./storage.ts");
		({ collabServer } = await import("../collab/hocuspocus.ts"));
		projectOperations = await import("./project-operations.ts");
		projectSearch = await import("./project-search.ts");
	});

	after(async () => {
		for (const document of collabServer?.documents.values() ?? []) {
			document.destroy();
		}
		collabServer?.documents.clear();
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("searches across Markdown and CSS files including live collaborative edits", async () => {
		const projectId = "search-multi";
		await storage.saveDocumentContent(
			`project/${projectId}/deck.md`,
			"# Quarterly Target\n\nTarget metrics",
		);
		await storage.saveDocumentContent(
			`project/${projectId}/chapters/part.md`,
			"## Part\n\ntarget details",
		);
		await storage.saveDocumentContent(
			`project/${projectId}/theme/custom.css`,
			"/* Target color */\nsection { color: navy; }",
		);
		await storage.saveProjectFile(projectId, "assets/target.png", new Uint8Array([1, 2, 3]));

		const liveName = `project/${projectId}/chapters/part.md`;
		const connection = await collabServer.openDirectConnection(liveName);
		try {
			await connection.transact((document) => {
				document.getText("content").insert(0, "Live Target\n");
			});

			const insensitive = await projectSearch.searchProjectFiles(projectId, "target");
			equal(insensitive.totalMatches, 5);
			deepEqual(
				insensitive.files.map((file) => [file.fileId, file.matches.length]),
				[
					["chapters/part.md", 2],
					["deck.md", 2],
					["theme/custom.css", 1],
				],
			);

			const sensitive = await projectSearch.searchProjectFiles(projectId, "Target", {
				caseSensitive: true,
			});
			equal(sensitive.totalMatches, 4);
			deepEqual(
				sensitive.files.map((file) => [file.fileId, file.matches.length]),
				[
					["chapters/part.md", 1],
					["deck.md", 2],
					["theme/custom.css", 1],
				],
			);
		} finally {
			await connection.disconnect();
		}
	});

	test("replaces a single match through Hocuspocus and rejects stale offsets", async () => {
		const projectId = "search-replace-one";
		const fileId = "slides.md";
		const documentName = `project/${projectId}/${fileId}`;
		await storage.saveDocumentContent(documentName, "Alpha beta Alpha");

		const results = await projectSearch.searchProjectFiles(projectId, "alpha");
		const firstMatch = results.files[0]?.matches[0];
		ok(firstMatch);

		const connection = await collabServer.openDirectConnection(documentName);
		try {
			const replaced = await projectSearch.replaceProjectMatch(projectId, "user-1", {
				fileId,
				match: firstMatch,
				replacement: "Gamma",
			});
			deepEqual(replaced, { fileId, replacedMatches: 1 });
			equal(
				collabServer.documents.get(documentName)?.getText("content").toJSON(),
				"Gamma beta Alpha",
			);
			equal(await storage.getDocumentContent(documentName), "Gamma beta Alpha");

			await rejects(
				() =>
					projectSearch.replaceProjectMatch(projectId, "user-1", {
						fileId,
						match: firstMatch,
						replacement: "Delta",
					}),
				(error: unknown) =>
					error instanceof projectSearch.ProjectSearchError && error.status === 409,
			);
		} finally {
			await connection.disconnect();
		}
	});

	test("replaces all matches across a single file or the entire project", async () => {
		const projectId = "search-replace-all";
		await storage.saveDocumentContent(`project/${projectId}/a.md`, "foo and FOO");
		await storage.saveDocumentContent(`project/${projectId}/b.md`, "foo bar");
		await storage.saveDocumentContent(`project/${projectId}/theme.css`, "/* foo */");

		const singleFile = await projectSearch.replaceAllProjectMatches(projectId, "user-1", {
			query: "foo",
			replacement: "baz",
			caseSensitive: true,
			fileId: "a.md",
		});
		deepEqual(singleFile, { replacedMatches: 1, updatedFiles: ["a.md"] });
		equal(await storage.getDocumentContent(`project/${projectId}/a.md`), "baz and FOO");
		equal(await storage.getDocumentContent(`project/${projectId}/b.md`), "foo bar");

		const allFiles = await projectSearch.replaceAllProjectMatches(projectId, "user-1", {
			query: "foo",
			replacement: "qux",
			caseSensitive: false,
		});
		deepEqual(allFiles, {
			replacedMatches: 3,
			updatedFiles: ["a.md", "b.md", "theme.css"],
		});
		equal(await storage.getDocumentContent(`project/${projectId}/a.md`), "baz and qux");
		equal(await storage.getDocumentContent(`project/${projectId}/b.md`), "qux bar");
		equal(await storage.getDocumentContent(`project/${projectId}/theme.css`), "/* qux */");
	});

	test("rejects invalid or reserved file paths, enforces write re-checks, and blocks replacements during Git sync", async () => {
		const projectId = "search-guards";
		await storage.saveDocumentContent(`project/${projectId}/deck.md`, "Hello");

		for (const fileId of [
			"../escape.md",
			"assets/photo.png",
			"__presence/deck.md",
			"reserved.yjs/deck.md",
			"chapters//deck.md",
			"chapters\\deck.md",
		]) {
			await rejects(
				() =>
					projectSearch.replaceAllProjectMatches(projectId, "user-1", {
						query: "Hello",
						replacement: "Hi",
						fileId,
					}),
				(error: unknown) =>
					error instanceof projectSearch.ProjectSearchError && error.status === 400,
				fileId,
			);
		}

		await rejects(
			() =>
				projectSearch.replaceAllProjectMatches(projectId, "user-1", {
					query: "Hello",
					replacement: "Hi",
					verifyWriteAccess: () => {
						throw new projectSearch.ProjectSearchError("Write access denied.", 403);
					},
				}),
			(error: unknown) => error instanceof projectSearch.ProjectSearchError && error.status === 403,
		);
		equal(await storage.getDocumentContent(`project/${projectId}/deck.md`), "Hello");

		const sync = projectOperations.beginProjectSync(projectId);
		ok(sync);
		try {
			await rejects(
				() =>
					projectSearch.replaceAllProjectMatches(projectId, "user-1", {
						query: "Hello",
						replacement: "Hi",
					}),
				(error: unknown) =>
					error instanceof projectSearch.ProjectSearchError && error.status === 409,
			);
		} finally {
			sync.release();
		}
	});
});
