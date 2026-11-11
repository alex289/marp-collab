import { after, before, describe, test, mock } from "node:test";
import { deepEqual, doesNotMatch, equal, rejects } from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import git from "isomorphic-git";

describe("project Git sync", () => {
	let tempDir: string;
	let storage: typeof import("./storage.ts");
	let getProjectGitConfig: typeof import("./git-sync.ts").getProjectGitConfig;
	let gitSync: typeof import("./git-sync.ts");

	before(async () => {
		mock.method(git, "listServerRefs", () => Promise.resolve([]));
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-git-sync-"));
		process.env.DATA_PATH = tempDir;
		process.env.AUTH_SECRET = "test-git-credential-secret";
		storage = await import("./storage.ts");
		gitSync = await import("./git-sync.ts");
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
});
