import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { mergeProjectBranches, type ProjectGitResolution } from "./git-merge.ts";
import { clearProjectDocumentState, getProjectDirectory } from "./storage.ts";

const REMOTE = "origin";
const CREDENTIALS_FILE = "marp-collab-credentials";

type GitAuthor = {
	name: string;
	email: string;
};

type GitCredentials = {
	username?: string;
	token?: string;
};

type StoredCredentials = {
	username?: string;
	token: string;
};

export type ProjectGitConfig = {
	configured: boolean;
	remoteUrl: string | null;
	branch: string;
	hasCredentials: boolean;
	username: string | null;
};

export class ProjectGitContentError extends Error {}
export class ProjectGitNotConfiguredError extends Error {}

function authOptions(credentials: GitCredentials) {
	if (!credentials.token) {
		return {};
	}

	return {
		onAuth: () => ({
			username: credentials.username || credentials.token!,
			password: credentials.username ? credentials.token : undefined,
		}),
	};
}

function credentialsPath(dir: string): string {
	return join(dir, ".git", CREDENTIALS_FILE);
}

function credentialsKey(): Buffer {
	const secret = process.env.AUTH_SECRET;
	if (!secret) {
		throw new Error("AUTH_SECRET is not set");
	}

	return createHmac("sha256", secret).update("marp-collab-git-credentials").digest();
}

async function readCredentials(projectId: string, dir: string): Promise<GitCredentials> {
	try {
		const encrypted = JSON.parse(await readFile(credentialsPath(dir), "utf8")) as {
			iv: string;
			tag: string;
			data: string;
		};
		const decipher = createDecipheriv(
			"aes-256-gcm",
			credentialsKey(),
			Buffer.from(encrypted.iv, "base64url"),
		);
		decipher.setAAD(Buffer.from(projectId));
		decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
		const plaintext = Buffer.concat([
			decipher.update(Buffer.from(encrypted.data, "base64url")),
			decipher.final(),
		]);
		const credentials = JSON.parse(plaintext.toString()) as StoredCredentials;

		return typeof credentials.token === "string" ? credentials : {};
	} catch {
		return {};
	}
}

async function saveCredentials(
	projectId: string,
	dir: string,
	credentials: GitCredentials,
): Promise<void> {
	const existing = await readCredentials(projectId, dir);
	const token = credentials.token || existing.token;
	if (!token) {
		return;
	}

	const plaintext = JSON.stringify({ username: credentials.username ?? existing.username, token });
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", credentialsKey(), iv);
	cipher.setAAD(Buffer.from(projectId));
	const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);

	await writeFile(
		credentialsPath(dir),
		JSON.stringify({
			iv: iv.toString("base64url"),
			tag: cipher.getAuthTag().toString("base64url"),
			data: data.toString("base64url"),
		}),
		{ mode: 0o600 },
	);
}

async function hasGitDirectory(dir: string): Promise<boolean> {
	try {
		await access(join(dir, ".git"));
		return true;
	} catch {
		return false;
	}
}

async function stageProjectFiles(dir: string): Promise<boolean> {
	await git.walk({
		fs,
		dir,
		trees: [git.WORKDIR()],
		map: async (filepath, [entry]) => {
			if (entry && (await entry.mode()) === 0o120000) {
				throw new ProjectGitContentError(`Symbolic links are not supported: ${filepath}`);
			}
		},
	});

	const matrix = await git.statusMatrix({ fs, dir });
	let changed = false;

	for (const [filepath, head, worktree] of matrix) {
		if (filepath.endsWith(".yjs")) {
			if (head) {
				await git.remove({ fs, dir, filepath });
				changed = true;
			}
			continue;
		}

		if (head === worktree) {
			continue;
		}

		if (worktree) {
			await git.add({ fs, dir, filepath });
		} else {
			await git.remove({ fs, dir, filepath });
		}
		changed = true;
	}

	return changed;
}

async function commitProjectFiles(dir: string, branch: string, author: GitAuthor): Promise<void> {
	if (!(await stageProjectFiles(dir))) {
		return;
	}

	await git.commit({
		fs,
		dir,
		ref: branch,
		message: "Sync project files",
		author,
	});
}

async function configureBranch(dir: string, branch: string): Promise<void> {
	await git.setConfig({ fs, dir, path: `branch.${branch}.remote`, value: REMOTE });
	await git.setConfig({
		fs,
		dir,
		path: `branch.${branch}.merge`,
		value: `refs/heads/${branch}`,
	});
}

async function getConfiguredProject(projectId: string) {
	const dir = await getProjectDirectory(projectId);
	if (!(await hasGitDirectory(dir))) {
		throw new ProjectGitNotConfiguredError("Git sync is not configured");
	}

	const [branch, remotes, credentials] = await Promise.all([
		git.currentBranch({ fs, dir, fullname: false }),
		git.listRemotes({ fs, dir }),
		readCredentials(projectId, dir),
	]);
	const origin = remotes.find((remote) => remote.remote === REMOTE);
	if (!origin) {
		throw new ProjectGitNotConfiguredError("Git sync is not configured");
	}

	return { dir, branch: branch ?? "main", remoteUrl: origin.url, credentials };
}

async function getRemoteBranch(
	dir: string,
	remoteUrl: string,
	branch: string,
	credentials: GitCredentials,
) {
	const refs = await git.listServerRefs({
		http,
		url: remoteUrl,
		prefix: `refs/heads/${branch}`,
		...authOptions(credentials),
	});

	return refs.find((ref) => ref.ref === `refs/heads/${branch}`);
}

export async function getProjectGitConfig(projectId: string): Promise<ProjectGitConfig> {
	try {
		const { remoteUrl, branch, credentials } = await getConfiguredProject(projectId);
		return {
			configured: true,
			remoteUrl,
			branch,
			hasCredentials: Boolean(credentials.token),
			username: credentials.username ?? null,
		};
	} catch (error) {
		if (!(error instanceof ProjectGitNotConfiguredError)) {
			throw error;
		}

		return {
			configured: false,
			remoteUrl: null,
			branch: "main",
			hasCredentials: false,
			username: null,
		};
	}
}

export async function configureProjectGit({
	projectId,
	remoteUrl,
	branch,
	credentials,
}: {
	projectId: string;
	remoteUrl: string;
	branch: string;
	credentials: GitCredentials;
}): Promise<ProjectGitConfig> {
	const dir = await getProjectDirectory(projectId);
	if (!(await hasGitDirectory(dir))) {
		await git.init({ fs, dir, defaultBranch: branch });
	}

	const currentBranch = await git.currentBranch({ fs, dir, fullname: false });
	if (currentBranch && currentBranch !== branch) {
		await git.renameBranch({ fs, dir, oldref: currentBranch, ref: branch, checkout: true });
	}

	await git.addRemote({ fs, dir, remote: REMOTE, url: remoteUrl, force: true });
	await configureBranch(dir, branch);
	await saveCredentials(projectId, dir, credentials);

	return getProjectGitConfig(projectId);
}

export async function pullProjectFromGit({
	projectId,
	author,
	resolutions,
}: {
	projectId: string;
	author: GitAuthor;
	resolutions?: Record<string, ProjectGitResolution>;
}): Promise<{ commit: string; pulled: boolean }> {
	const { dir, remoteUrl, branch, credentials } = await getConfiguredProject(projectId);
	await configureBranch(dir, branch);
	await commitProjectFiles(dir, branch, author);

	const remoteBranch = await getRemoteBranch(dir, remoteUrl, branch, credentials);
	let pulled = false;

	if (remoteBranch) {
		await git.fetch({
			fs,
			http,
			dir,
			remote: REMOTE,
			ref: branch,
			singleBranch: true,
			tags: false,
			...authOptions(credentials),
		});
		await git.walk({
			fs,
			dir,
			trees: [git.TREE({ ref: `refs/remotes/${REMOTE}/${branch}` })],
			map: async (filepath, [entry]) => {
				if (entry && (await entry.mode()) === 0o120000) {
					throw new ProjectGitContentError(`Symbolic links are not supported: ${filepath}`);
				}
			},
		});

		const merge = await mergeProjectBranches({
			dir,
			ours: branch,
			theirs: `refs/remotes/${REMOTE}/${branch}`,
			author,
			resolutions,
		});
		pulled = !merge.alreadyMerged;

		if (pulled) {
			await git.checkout({ fs, dir, ref: branch, force: true });
			await clearProjectDocumentState(projectId);
			await commitProjectFiles(dir, branch, author);
		}
	}

	return { commit: await git.resolveRef({ fs, dir, ref: branch }), pulled };
}

export async function pushProjectToGit({
	projectId,
	author,
}: {
	projectId: string;
	author: GitAuthor;
}): Promise<{ commit: string; pushed: boolean }> {
	const { dir, remoteUrl, branch, credentials } = await getConfiguredProject(projectId);
	await configureBranch(dir, branch);
	await commitProjectFiles(dir, branch, author);

	const [remoteBranch, commit] = await Promise.all([
		getRemoteBranch(dir, remoteUrl, branch, credentials),
		git.resolveRef({ fs, dir, ref: branch }),
	]);
	const pushed = remoteBranch?.oid !== commit;
	if (pushed) {
		await git.push({
			fs,
			http,
			dir,
			remote: REMOTE,
			ref: branch,
			...authOptions(credentials),
		});
	}

	return { commit, pushed };
}
