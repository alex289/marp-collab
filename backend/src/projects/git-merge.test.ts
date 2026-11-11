import { after, before, describe, test } from "node:test";
import { deepEqual, equal, match, rejects } from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import git from "isomorphic-git";
import { mergeProjectBranches, mergeTextFiles, ProjectGitConflictError } from "./git-merge.ts";

const author = { name: "Test User", email: "test@example.com" };

async function commitFile(dir: string, filepath: string, content: string | Uint8Array) {
	await writeFile(join(dir, filepath), content);
	await git.add({ fs, dir, filepath });
	await git.commit({ fs, dir, message: `Update ${filepath}`, author });
}

async function deleteFile(dir: string, filepath: string) {
	await rm(join(dir, filepath));
	await git.remove({ fs, dir, filepath });
	await git.commit({ fs, dir, message: `Delete ${filepath}`, author });
}

describe("project Git merge", () => {
	let tempDir: string;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-git-merge-"));
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("keeps both sides of a text conflict", async () => {
		const dir = join(tempDir, "text");
		await git.init({ fs, dir, defaultBranch: "main" });
		await commitFile(dir, "slides.md", "# Slides\n");
		await git.branch({ fs, dir, ref: "remote" });
		await commitFile(dir, "slides.md", "# Slides\n\nProject paragraph\n");
		await git.checkout({ fs, dir, ref: "remote", force: true });
		await commitFile(dir, "slides.md", "# Slides\n\nRemote paragraph\n");
		await git.checkout({ fs, dir, ref: "main", force: true });

		const merge = await mergeProjectBranches({
			dir,
			ours: "refs/heads/main",
			theirs: "remote",
			author,
		});

		const content = await readFile(join(dir, "slides.md"), "utf8");
		match(content, /Project paragraph/);
		match(content, /Remote paragraph/);
		deepEqual(merge.overlapping, ["slides.md"]);
	});

	test("merges files that differ only in line endings without duplicating them", () => {
		deepEqual(mergeTextFiles("a\r\nb\r\nc\r\n", "a\r\nB\r\nc\r\n", "a\nb\nc\n"), {
			text: "a\nB\nc\n",
			overlapping: false,
		});
		deepEqual(
			mergeTextFiles("a\r\nb\r\nc\r\nd\r\n", "a\r\nB\r\nc\r\nd\r\n", "a\r\nb\r\nc\r\nD\r\n"),
			{ text: "a\r\nB\r\nc\r\nD\r\n", overlapping: false },
		);
	});

	test("asks which side of a binary conflict to keep", async () => {
		const dir = join(tempDir, "binary");
		await git.init({ fs, dir, defaultBranch: "main" });
		await commitFile(dir, "image.png", new Uint8Array([0, 1, 2]));
		await git.branch({ fs, dir, ref: "remote" });
		await commitFile(dir, "image.png", new Uint8Array([3, 4, 5]));
		await git.checkout({ fs, dir, ref: "remote", force: true });
		await commitFile(dir, "image.png", new Uint8Array([6, 7, 8]));
		await git.checkout({ fs, dir, ref: "main", force: true });

		await rejects(
			() => mergeProjectBranches({ dir, ours: "refs/heads/main", theirs: "remote", author }),
			(error: unknown) => {
				deepEqual((error as ProjectGitConflictError).conflicts, [
					{ path: "image.png", type: "binary" },
				]);
				return error instanceof ProjectGitConflictError;
			},
		);

		await mergeProjectBranches({
			dir,
			ours: "refs/heads/main",
			theirs: "remote",
			author,
			resolutions: { "image.png": "remote" },
		});
		const content = await readFile(join(dir, "image.png"));
		equal(Buffer.compare(content, Buffer.from([6, 7, 8])), 0);
	});

	test("asks before applying a remote deletion over a project change", async () => {
		const dir = join(tempDir, "remote-delete");
		await git.init({ fs, dir, defaultBranch: "main" });
		await commitFile(dir, "notes.md", "Base\n");
		await git.branch({ fs, dir, ref: "remote" });
		await commitFile(dir, "notes.md", "Project change\n");
		await git.checkout({ fs, dir, ref: "remote", force: true });
		await deleteFile(dir, "notes.md");
		await git.checkout({ fs, dir, ref: "main", force: true });

		await rejects(
			() => mergeProjectBranches({ dir, ours: "refs/heads/main", theirs: "remote", author }),
			(error: unknown) => {
				deepEqual((error as ProjectGitConflictError).conflicts, [
					{ path: "notes.md", type: "remote-deleted" },
				]);
				return error instanceof ProjectGitConflictError;
			},
		);

		await mergeProjectBranches({
			dir,
			ours: "refs/heads/main",
			theirs: "remote",
			author,
			resolutions: { "notes.md": "remote" },
		});
		await rejects(() => readFile(join(dir, "notes.md")));
	});

	test("asks before applying a project deletion over a remote change", async () => {
		const dir = join(tempDir, "project-delete");
		await git.init({ fs, dir, defaultBranch: "main" });
		await commitFile(dir, "notes.md", "Base\n");
		await git.branch({ fs, dir, ref: "remote" });
		await deleteFile(dir, "notes.md");
		await git.checkout({ fs, dir, ref: "remote", force: true });
		await commitFile(dir, "notes.md", "Remote change\n");
		await git.checkout({ fs, dir, ref: "main", force: true });

		await rejects(
			() => mergeProjectBranches({ dir, ours: "refs/heads/main", theirs: "remote", author }),
			(error: unknown) => {
				deepEqual((error as ProjectGitConflictError).conflicts, [
					{ path: "notes.md", type: "project-deleted" },
				]);
				return error instanceof ProjectGitConflictError;
			},
		);

		await mergeProjectBranches({
			dir,
			ours: "refs/heads/main",
			theirs: "remote",
			author,
			resolutions: { "notes.md": "remote" },
		});
		equal(await readFile(join(dir, "notes.md"), "utf8"), "Remote change\n");
		const { blob } = await git.readBlob({
			fs,
			dir,
			oid: await git.resolveRef({ fs, dir, ref: "refs/heads/main" }),
			filepath: "notes.md",
		});
		equal(Buffer.from(blob).toString(), "Remote change\n");
	});

	test("asks which independently created file to keep", async () => {
		const dir = join(tempDir, "add-add");
		await git.init({ fs, dir, defaultBranch: "main" });
		await commitFile(dir, "slides.md", "# Slides\n");
		await git.branch({ fs, dir, ref: "remote" });
		await commitFile(dir, "notes.md", "Project notes\n");
		await git.checkout({ fs, dir, ref: "remote", force: true });
		await commitFile(dir, "notes.md", "Remote notes\n");
		await git.checkout({ fs, dir, ref: "main", force: true });

		await rejects(
			() => mergeProjectBranches({ dir, ours: "refs/heads/main", theirs: "remote", author }),
			(error: unknown) => {
				deepEqual((error as ProjectGitConflictError).conflicts, [
					{ path: "notes.md", type: "add-add" },
				]);
				return error instanceof ProjectGitConflictError;
			},
		);

		await mergeProjectBranches({
			dir,
			ours: "refs/heads/main",
			theirs: "remote",
			author,
			resolutions: { "notes.md": "project" },
		});
		equal(await readFile(join(dir, "notes.md"), "utf8"), "Project notes\n");
		const { blob } = await git.readBlob({
			fs,
			dir,
			oid: await git.resolveRef({ fs, dir, ref: "refs/heads/main" }),
			filepath: "notes.md",
		});
		equal(Buffer.from(blob).toString(), "Project notes\n");
	});
});
