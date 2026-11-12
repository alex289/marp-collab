import { test } from "node:test";
import { equal, rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_GIT_DOCUMENT_BYTES, ProjectGitContentError, syncSupportedFiles } from "./git-files.ts";

test("replaces a supported directory with a file while retaining unrelated contents", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		const destination = join(root, "destination");
		await mkdir(source);
		await mkdir(join(destination, "deck.md"), { recursive: true });
		await writeFile(join(destination, "deck.md", "old.md"), "old");
		await writeFile(join(destination, "code.ts"), "code");
		await writeFile(join(source, "deck.md"), "new");
		await syncSupportedFiles(source, destination);
		equal(await readFile(join(destination, "deck.md"), "utf8"), "new");
		equal(await readFile(join(destination, "code.ts"), "utf8"), "code");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("keeps empty folders users created but removes folders emptied by the sync", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		const destination = join(root, "destination");
		await mkdir(source);
		await mkdir(join(destination, "drafts"), { recursive: true });
		await mkdir(join(destination, "old", "nested"), { recursive: true });
		await writeFile(join(destination, "old", "nested", "deck.md"), "old");
		await syncSupportedFiles(source, destination);
		equal((await stat(join(destination, "drafts"))).isDirectory(), true);
		await rejects(stat(join(destination, "old")), { code: "ENOENT" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects symbolic links as a content error", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		await mkdir(source);
		await writeFile(join(source, "deck.md"), "deck");
		await symlink("deck.md", join(source, "linked.md"));
		await rejects(syncSupportedFiles(source, join(root, "destination")), ProjectGitContentError);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("removes a deleted file's collaboration state so its folder can be pruned", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		const destination = join(root, "destination");
		await mkdir(source);
		await mkdir(join(destination, "slides"), { recursive: true });
		await writeFile(join(destination, "slides", "deck.md"), "old");
		await writeFile(join(destination, "slides", "deck.md.yjs"), "state");
		await syncSupportedFiles(source, destination, { intoProject: true });
		await rejects(stat(join(destination, "slides")), { code: "ENOENT" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("keeps a folder named like a deleted file's collaboration state", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		const destination = join(root, "destination");
		await mkdir(source);
		await mkdir(join(destination, "deck.md.yjs"), { recursive: true });
		await writeFile(join(destination, "deck.md"), "old");
		await writeFile(join(destination, "deck.md.yjs", "code.ts"), "code");
		await syncSupportedFiles(source, destination, { intoProject: true });
		await rejects(stat(join(destination, "deck.md")), { code: "ENOENT" });
		equal(await readFile(join(destination, "deck.md.yjs", "code.ts"), "utf8"), "code");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("limits documents pulled into the project to what collaboration can load", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		await mkdir(source);
		await writeFile(join(source, "deck.md"), Buffer.alloc(MAX_GIT_DOCUMENT_BYTES + 1, "a"));
		await rejects(
			syncSupportedFiles(source, join(root, "project"), { intoProject: true }),
			/Document exceeds the size limit: deck.md/,
		);
		await syncSupportedFiles(source, join(root, "repository"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects pulled folders that take the place of a document's collaboration state", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		await mkdir(join(source, "deck.md.yjs"), { recursive: true });
		await writeFile(join(source, "deck.md"), "deck");
		await writeFile(join(source, "deck.md.yjs", "image.png"), "png");
		await rejects(
			syncSupportedFiles(source, join(root, "project"), { intoProject: true }),
			ProjectGitContentError,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("changes nothing when something that stays is where a copied file goes", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		const destination = join(root, "destination");
		await mkdir(source);
		await writeFile(join(source, "b.md"), "new");
		await writeFile(join(source, "z.md"), "new");
		await mkdir(join(destination, "z.md"), { recursive: true });
		await writeFile(join(destination, "a.md"), "old");
		await writeFile(join(destination, "a.md.yjs"), "state");
		await writeFile(join(destination, "b.md"), "old");
		await rejects(
			syncSupportedFiles(source, destination, { intoProject: true }),
			/z.md is in the way/,
		);
		equal(await readFile(join(destination, "a.md.yjs"), "utf8"), "state");
		equal(await readFile(join(destination, "b.md"), "utf8"), "old");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
