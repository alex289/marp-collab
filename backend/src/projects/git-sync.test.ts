import { after, before, describe, test } from "node:test";
import { deepEqual, doesNotMatch, equal, rejects } from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import git from "isomorphic-git";

describe("project Git sync", () => {
	let tempDir: string;
	let storage: typeof import("./storage.ts");
	let getProjectGitConfig: typeof import("./git-sync.ts").getProjectGitConfig;
	let gitSync: typeof import("./git-sync.ts");

	before(async () => {
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
			hasCredentials: false,
			username: null,
		});

		const dir = await storage.getProjectDirectory("git-project");
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
			hasCredentials: true,
			username: "git-user",
		});

		const dir = await storage.getProjectDirectory("credential-project");
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
		await git.setConfig({
			fs,
			dir,
			path: "branch.main.merge",
			value: "refs/heads/main= refs/heads/main",
		});

		await rejects(
			() =>
				gitSync.pushProjectToGit({
					projectId: "symlink-project",
					author: { name: "Test User", email: "test@example.com" },
				}),
			gitSync.ProjectGitContentError,
		);
		equal(await git.getConfig({ fs, dir, path: "branch.main.merge" }), "refs/heads/main");
	});
});
