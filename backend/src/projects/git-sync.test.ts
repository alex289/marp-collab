import { after, before, describe, test, mock } from "node:test";
import { deepEqual, doesNotMatch, equal, rejects } from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import git from "isomorphic-git";

describe("project Git sync", () => {
	let tempDir: string;
	let storage: typeof import("./storage.ts");
	let getProjectGitConfig: typeof import("./git-sync.ts").getProjectGitConfig;
	let gitSync: typeof import("./git-sync.ts");
	let GIT_TREE_LIMITS: typeof import("./git-tasks.ts").GIT_TREE_LIMITS;

	before(async () => {
		mock.method(git, "listServerRefs", () => Promise.resolve([]));
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-git-sync-"));
		process.env.DATA_PATH = tempDir;
		process.env.AUTH_SECRET = "test-git-credential-secret";
		storage = await import("./storage.ts");
		(await import("./git-process.ts")).runGitTasksInProcess();
		gitSync = await import("./git-sync.ts");
		({ GIT_TREE_LIMITS } = await import("./git-tasks.ts"));
		getProjectGitConfig = gitSync.getProjectGitConfig;
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
		delete process.env.AUTH_SECRET;
	});

	test("reads Git configuration stored with the project", async () => {
		deepEqual(await getProjectGitConfig("git-project"), {
			configured: false,
			remoteUrl: null,
			branch: "main",
			folder: "",
			hasCredentials: false,
			username: null,
		});

		const dir = join(await storage.getProjectDirectory("git-project"), ".git", "repository");
		await git.init({ fs, dir, defaultBranch: "slides" });
		await git.addRemote({
			fs,
			dir,
			remote: "origin",
			url: "https://example.com/slides.git",
		});

		deepEqual(await getProjectGitConfig("git-project"), {
			configured: true,
			remoteUrl: "https://example.com/slides.git",
			branch: "slides",
			folder: "",
			hasCredentials: false,
			username: null,
		});
	});

	test("reads settings without creating the project's directory", async () => {
		await getProjectGitConfig("missing-project");
		await rejects(stat(join(tempDir, "presentations", "missing-project")), { code: "ENOENT" });
	});

	test("persists encrypted credentials with the project", async () => {
		await gitSync.configureProjectGit({
			projectId: "credential-project",
			remoteUrl: "https://example.com/slides.git",
			branch: "main",
			credentials: { username: "git-user", token: "secret-access-token" },
		});

		deepEqual(await getProjectGitConfig("credential-project"), {
			configured: true,
			remoteUrl: "https://example.com/slides.git",
			branch: "main",
			folder: "",
			hasCredentials: true,
			username: "git-user",
		});

		const dir = join(await storage.getProjectDirectory("credential-project"), ".git", "repository");
		const encrypted = await readFile(join(dir, ".git", "marp-collab-credentials"), "utf8");
		doesNotMatch(encrypted, /secret-access-token/);
	});

	test("rejects symbolic links before contacting the remote", async () => {
		const dir = await storage.getProjectDirectory("symlink-project");
		await writeFile(join(dir, "slides.md"), "# Slides");
		await symlink("slides.md", join(dir, "linked.md"));
		await gitSync.configureProjectGit({
			projectId: "symlink-project",
			remoteUrl: "https://example.com/repo.git",
			branch: "main",
			credentials: {},
		});
		const repository = join(dir, ".git", "repository");
		await git.setConfig({
			fs,
			dir: repository,
			path: "branch.main.merge",
			value: "refs/heads/main= refs/heads/main",
		});

		await rejects(
			() =>
				gitSync.pushProjectToGit({
					projectId: "symlink-project",
					author: { name: "Test User", email: "test@example.com" },
				}),
			/Symbolic links are not supported/,
		);
		equal(
			await git.getConfig({ fs, dir: repository, path: "branch.main.merge" }),
			"refs/heads/main",
		);
	});
	test("validates credentials before persisting settings and keeps prior settings on failure", async (t) => {
		const options = {
			projectId: "validation-project",
			remoteUrl: "https://example.com/repo.git",
			branch: "main",
			credentials: { token: "valid" },
		};
		await gitSync.configureProjectGit(options);
		const prior = await getProjectGitConfig(options.projectId);
		t.mock.method(git, "listServerRefs", (args: Parameters<typeof git.listServerRefs>[0]) => {
			deepEqual(args.onAuth!("https://example.com/repo.git", {}), {
				username: "git",
				password: "invalid",
			});
			return Promise.reject(new Error("401"));
		});
		await rejects(
			gitSync.configureProjectGit({ ...options, credentials: { token: "invalid" } }),
			gitSync.ProjectGitRemoteError,
		);
		deepEqual(await getProjectGitConfig(options.projectId), prior);
	});

	test("pulls supported files from a folder and pushes without modifying unrelated repository files", async (t) => {
		const remote = join(tempDir, "remote");
		await mkdir(join(remote, "slides"), { recursive: true });
		await writeFile(join(remote, "slides", "deck.md"), "# Remote slides");
		await writeFile(join(remote, "slides", "code.ts"), "private code");
		await writeFile(join(remote, "outside.md"), "outside folder");
		await writeFile(join(remote, "slides", "deck.md.yjs"), "remote state");
		const run = (dir: string, ...args: string[]) =>
			execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
		run(remote, "init", "-b", "main");
		run(remote, "add", ".");
		run(
			remote,
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"commit",
			"-m",
			"Remote",
		);
		t.mock.method(git, "listServerRefs", () =>
			Promise.resolve([{ ref: "refs/heads/main", oid: run(remote, "rev-parse", "HEAD") }]),
		);
		t.mock.method(git, "fetch", ({ dir }: { dir: string }) => {
			run(dir, "fetch", remote, "main:refs/remotes/origin/main");
			return Promise.resolve();
		});
		t.mock.method(git, "push", ({ dir }: { dir: string }) => {
			run(remote, "config", "receive.denyCurrentBranch", "ignore");
			run(dir, "push", remote, "main");
			return Promise.resolve();
		});
		const projectId = "folder-project";
		const dir = await storage.getProjectDirectory(projectId);
		const author = { name: "Test", email: "test@example.com" };
		await gitSync.configureProjectGit({
			projectId,
			remoteUrl: "https://example.com/repo.git",
			branch: "main",
			folder: "slides",
			credentials: {},
		});
		equal((await gitSync.pullProjectFromGit({ projectId, author })).pulled, true);
		equal(await readFile(join(dir, "deck.md"), "utf8"), "# Remote slides");
		deepEqual(
			(await storage.getDeckFiles(projectId)).map((file) => file.id),
			["deck.md"],
		);
		await writeFile(join(dir, "deck.md"), "# Local edits");
		await writeFile(join(dir, "deck.md.yjs"), "local state");
		await gitSync.pushProjectToGit({ projectId, author });
		equal(run(remote, "show", "HEAD:slides/deck.md"), "# Local edits");
		equal(run(remote, "show", "HEAD:slides/code.ts"), "private code");
		equal(run(remote, "show", "HEAD:outside.md"), "outside folder");
		equal(run(remote, "show", "HEAD:slides/deck.md.yjs"), "remote state");
		await rm(join(dir, "deck.md"));
		await gitSync.pushProjectToGit({ projectId, author });
		equal(run(remote, "ls-tree", "HEAD", "slides/deck.md"), "");
	});

	describe("with a branch other than main", () => {
		const author = { name: "Test", email: "test@example.com" };
		const run = (dir: string, ...args: string[]) =>
			execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
		let remote: string;

		before(async () => {
			remote = join(tempDir, "slides-remote");
			await mkdir(remote, { recursive: true });
			run(remote, "init", "-b", "slides");
			run(remote, "config", "receive.denyCurrentBranch", "ignore");
			await writeFile(join(remote, "deck.md"), "# Remote slides\n");
			run(remote, "add", ".");
			run(remote, "-c", "user.name=T", "-c", "user.email=t@e", "commit", "-m", "Remote");
		});

		function mockRemote(t: { mock: typeof mock }) {
			t.mock.method(git, "listServerRefs", () =>
				Promise.resolve([{ ref: "refs/heads/slides", oid: run(remote, "rev-parse", "slides") }]),
			);
			t.mock.method(git, "fetch", ({ dir }: { dir: string }) => {
				run(dir, "fetch", remote, "+slides:refs/remotes/origin/slides");
				return Promise.resolve();
			});
			t.mock.method(
				git,
				"push",
				({ dir, ref, remoteRef }: { dir: string; ref: string; remoteRef: string }) => {
					run(dir, "push", remote, `${ref}:${remoteRef}`);
					return Promise.resolve();
				},
			);
		}

		test("keeps the configured branch and pushes deletions", async (t) => {
			mockRemote(t);
			const projectId = "slides-branch-project";
			const dir = await storage.getProjectDirectory(projectId);
			const repository = join(dir, ".git", "repository");
			await gitSync.configureProjectGit({
				projectId,
				remoteUrl: "https://example.com/repo.git",
				branch: "slides",
				credentials: {},
			});

			await gitSync.pullProjectFromGit({ projectId, author });
			equal((await getProjectGitConfig(projectId)).branch, "slides");
			equal(await git.currentBranch({ fs, dir: repository, fullname: true }), "refs/heads/slides");

			await writeFile(join(dir, "notes.md"), "Notes\n");
			await gitSync.pushProjectToGit({ projectId, author });
			equal(run(remote, "show", "slides:notes.md"), "Notes");

			await rm(join(dir, "notes.md"));
			await gitSync.pushProjectToGit({ projectId, author });
			equal(run(remote, "ls-tree", "slides", "notes.md"), "");
			equal(run(remote, "branch", "--list", "main"), "");

			const commits = run(remote, "rev-list", "--count", "slides");
			deepEqual(await gitSync.pushProjectToGit({ projectId, author }), {
				commit: run(remote, "rev-parse", "slides"),
				pushed: false,
			});
			equal(run(remote, "rev-list", "--count", "slides"), commits);
		});

		/** Configures a project on the remote and pulls it once. */
		async function pulledProject(t: { mock: typeof mock }, projectId: string) {
			mockRemote(t);
			const dir = await storage.getProjectDirectory(projectId);
			const repository = join(dir, ".git", "repository");
			await gitSync.configureProjectGit({
				projectId,
				remoteUrl: "https://example.com/repo.git",
				branch: "slides",
				credentials: {},
			});
			await gitSync.pullProjectFromGit({ projectId, author });
			return { dir, repository };
		}

		/**
		 * Pulls a remote commit that adds `names` in a `junk` folder, all one blob, so the pack is a
		 * few kilobytes, and expects the pull to fail without checking anything out.
		 */
		async function pullJunk(
			t: { mock: typeof mock },
			projectId: string,
			content: Buffer,
			names: string[],
			error: RegExp,
		) {
			const { repository } = await pulledProject(t, projectId);
			const before = await git.resolveRef({ fs, dir: repository, ref: "refs/heads/slides" });
			const blob = execFileSync("git", ["-C", remote, "hash-object", "-w", "--stdin"], {
				input: content,
				encoding: "utf8",
			}).trim();
			const junk = execFileSync("git", ["-C", remote, "mktree"], {
				input: names.map((name) => `100644 blob ${blob}\t${name}\n`).join(""),
				encoding: "utf8",
			}).trim();
			const tree = execFileSync("git", ["-C", remote, "mktree"], {
				input: `${run(remote, "ls-tree", "slides")}\n040000 tree ${junk}\tjunk\n`,
				encoding: "utf8",
			}).trim();
			const commit = ["-c", "user.name=T", "-c", "user.email=t@e", "commit-tree", tree];
			const previous = run(remote, "rev-parse", "slides");
			run(
				remote,
				"update-ref",
				"refs/heads/slides",
				run(remote, ...commit, "-p", previous, "-m", "Junk"),
			);
			try {
				await rejects(
					gitSync.pullProjectFromGit({ projectId, author }),
					(rejection) =>
						rejection instanceof gitSync.ProjectGitContentError &&
						error.test(rejection.message) &&
						rejection.message.length < 2000,
				);
				equal(await git.resolveRef({ fs, dir: repository, ref: "refs/heads/slides" }), before);
				await rejects(stat(join(repository, "junk")), { code: "ENOENT" });
			} finally {
				run(remote, "update-ref", "refs/heads/slides", previous);
			}
		}

		const names = (count: number) => Array.from({ length: count }, (_, index) => `f${index}.bin`);

		/** Lowers the tree limits for one test, so it needs few files. */
		function limitTree(
			t: { after: (fn: () => void) => void },
			limits: Partial<typeof GIT_TREE_LIMITS>,
		) {
			const saved = { ...GIT_TREE_LIMITS };
			Object.assign(GIT_TREE_LIMITS, limits);
			t.after(() => Object.assign(GIT_TREE_LIMITS, saved));
		}

		test("rejects remote trees that list a file at more paths than can be checked out", async (t) => {
			limitTree(t, { entries: 100 });
			await pullJunk(t, "slides-fanout-count", Buffer.from("x"), names(100), /at most/);
		});

		test("rejects remote trees whose files together exceed the size limit on disk", async (t) => {
			// 130 copies of 8 MB exceed 1 GB, though the blob compresses to a few kilobytes.
			await pullJunk(
				t,
				"slides-fanout-size",
				Buffer.alloc(8 * 1024 * 1024),
				names(130),
				/exceeds the size limit/,
			);
		});

		test("rejects paths too long to check out, without quoting them", async (t) => {
			await pullJunk(
				t,
				"slides-long-name",
				Buffer.from("x"),
				[`${"x".repeat(5000)}.bin`],
				/too long/,
			);
		});

		test("checks the merged tree too, since it keeps the project's files", async (t) => {
			const projectId = "slides-merged-limit";
			const { dir } = await pulledProject(t, projectId);
			for (const name of names(40)) {
				await writeFile(join(dir, `${name}.md`), "slide\n");
			}
			// The remote's tree fits, but together with the project's 40 files the merge does not.
			limitTree(t, { entries: 60 });
			await pullJunk(t, projectId, Buffer.from("x"), names(40), /at most/);
		});

		test("finishes an interrupted rollback before committing again", async (t) => {
			const { repository } = await pulledProject(t, "slides-interrupted-rollback");
			await writeFile(join(remote, "code.ts"), "private code\n");
			run(remote, "add", ".");
			run(remote, "-c", "user.name=T", "-c", "user.email=t@e", "commit", "-m", "Code");
			await gitSync.pullProjectFromGit({ projectId: "slides-interrupted-rollback", author });
			const commit = await git.resolveRef({ fs, dir: repository, ref: "refs/heads/slides" });

			// A rollback that was stopped after clearing the working tree, before checking out again.
			await writeFile(join(repository, ".git", "marp-collab-reset"), commit);
			await rm(join(repository, "code.ts"));
			await rm(join(repository, ".git", "index"));
			await gitSync.pushProjectToGit({ projectId: "slides-interrupted-rollback", author });
			equal(run(remote, "show", "slides:code.ts"), "private code");
			await rejects(stat(join(repository, ".git", "marp-collab-reset")), { code: "ENOENT" });
		});

		test("commits project files the remote's .gitignore matches", async (t) => {
			const { dir } = await pulledProject(t, "slides-ignored");
			await writeFile(join(remote, ".gitignore"), "*.md\n");
			run(remote, "add", ".gitignore");
			run(remote, "-c", "user.name=T", "-c", "user.email=t@e", "commit", "-m", "Ignore");
			try {
				await gitSync.pullProjectFromGit({ projectId: "slides-ignored", author });
				await writeFile(join(dir, "ignored.md"), "Ignored\n");
				await gitSync.pushProjectToGit({ projectId: "slides-ignored", author });
				equal(run(remote, "show", "slides:ignored.md"), "Ignored");
			} finally {
				run(remote, "rm", "-q", "--cached", ".gitignore");
				await rm(join(remote, ".gitignore"));
				run(remote, "-c", "user.name=T", "-c", "user.email=t@e", "commit", "-q", "-m", "Unignore");
			}
		});

		test("rolls the branch back when applying a pull fails", async (t) => {
			mockRemote(t);
			const projectId = "slides-rollback-project";
			const dir = await storage.getProjectDirectory(projectId);
			const repository = join(dir, ".git", "repository");
			await gitSync.configureProjectGit({
				projectId,
				remoteUrl: "https://example.com/repo.git",
				branch: "slides",
				credentials: {},
			});
			await gitSync.pullProjectFromGit({ projectId, author });

			await writeFile(join(remote, "agenda.md"), "Agenda\n");
			run(remote, "add", ".");
			run(remote, "-c", "user.name=T", "-c", "user.email=t@e", "commit", "-m", "Agenda");
			// A folder in the project's way makes copying the pulled file fail after the merge.
			await mkdir(join(dir, "agenda.md"));
			await writeFile(join(dir, "agenda.md", "code.ts"), "unsupported");
			const before = await git.resolveRef({ fs, dir: repository, ref: "refs/heads/slides" });

			await rejects(gitSync.pullProjectFromGit({ projectId, author }));
			equal(await git.resolveRef({ fs, dir: repository, ref: "refs/heads/slides" }), before);

			await rm(join(dir, "agenda.md"), { recursive: true });
			equal((await gitSync.pullProjectFromGit({ projectId, author })).pulled, true);
			equal(await readFile(join(dir, "agenda.md"), "utf8"), "Agenda\n");
		});
	});
});
