import { after, before, describe, test } from "node:test";
import { equal, rejects } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectGitProcessError, runGitTask } from "./git-process.ts";
import { ProjectGitRemoteError, type GitTask } from "./git-tasks.ts";

describe("Git task processes", () => {
	const verify: GitTask = {
		type: "verify",
		remoteUrl: "http://example.com/repo.git",
		credentials: {},
	};
	let root: string;

	/** Writes a stand-in for the worker, to observe how the server treats its process. */
	async function worker(name: string, source: string): Promise<string> {
		const path = join(root, `${name}.mjs`);
		await writeFile(path, source);
		return path;
	}

	before(async () => {
		root = await mkdtemp(join(tmpdir(), "marp-test-git-process-"));
	});

	after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test("runs tasks in a separate process", async () => {
		const repository = join(root, "repository");
		const project = join(root, "project");
		await mkdir(project);
		await writeFile(join(project, "deck.md"), "# Slides\n");
		execFileSync("git", ["init", "-b", "main", repository]);

		const commit = await runGitTask({
			type: "commit",
			repository,
			branch: "main",
			projectDirectory: project,
			folder: "",
			author: { name: "Test", email: "test@example.com" },
		});
		equal(
			execFileSync("git", ["-C", repository, "show", `${commit}:deck.md`], { encoding: "utf8" }),
			"# Slides\n",
		);
	});

	test("keeps error types across the process boundary", async () => {
		await rejects(runGitTask(verify), ProjectGitRemoteError);
	});

	test("keeps the server's environment out of tasks", async () => {
		process.env.MARP_TEST_SECRET = "secret";
		try {
			const env = await worker(
				"env",
				"process.once('message', () => process.send({ ok: true, result: process.env }));",
			);
			const result = (await runGitTask(verify, { worker: env })) as unknown as NodeJS.ProcessEnv;
			equal(result.MARP_TEST_SECRET, undefined);
		} finally {
			delete process.env.MARP_TEST_SECRET;
		}
	});

	test("stops tasks that take too long", async () => {
		const hang = await worker("hang", "setInterval(() => {}, 1000);");
		await rejects(runGitTask(verify, { worker: hang, timeoutMs: 200 }), ProjectGitProcessError);
	});

	test("stops tasks that run out of heap", async () => {
		// About 100 MB of objects, which fits the default heap but not the one given here.
		const grow = await worker(
			"grow",
			`const kept = Array.from({ length: 1_000_000 }, (_, size) => ({ size, name: String(size) }));
			process.once("message", () => process.send({ ok: true, result: kept.length }));`,
		);
		await rejects(runGitTask(verify, { worker: grow, heapMb: 16 }), ProjectGitProcessError);
	});

	test("resets the working tree without files a stopped checkout left behind", async () => {
		const repository = join(root, "reset");
		const run = (...args: string[]) =>
			execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
		execFileSync("git", ["init", "-b", "main", repository]);
		await writeFile(join(repository, "deck.md"), "# Slides\n");
		run("add", ".");
		run("-c", "user.name=T", "-c", "user.email=t@e", "commit", "-m", "Slides");
		const commit = run("rev-parse", "main");
		await writeFile(join(repository, "deck.md"), "# Half written");
		await mkdir(join(repository, "junk"));
		await writeFile(join(repository, "junk", "partial.bin"), "partial");

		await runGitTask({ type: "reset", repository, branch: "main", commit });
		equal(run("status", "--porcelain", "--untracked-files=all"), "");
		equal(await readFile(join(repository, "deck.md"), "utf8"), "# Slides\n");
	});

	test(
		"stops tasks whose buffers exceed the memory limit",
		{ skip: process.platform !== "linux" && "reads resident memory from Linux's /proc" },
		async () => {
			// Buffers do not count toward the heap limit, and this one replies unless it is stopped.
			const grow = await worker(
				"buffers",
				`const kept = Buffer.alloc(256 * 1024 * 1024, 1);
				process.once("message", () => setTimeout(() => process.send({ ok: true }), 2000));`,
			);
			await rejects(
				runGitTask(verify, { worker: grow, residentBytes: 128 * 1024 * 1024 }),
				ProjectGitProcessError,
			);
		},
	);
});
