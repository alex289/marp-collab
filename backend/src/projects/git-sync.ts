import fs from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import git from "isomorphic-git";
import { projectGitHttp as http } from "./git-http.ts";
import { mergeProjectBranches, type ProjectGitResolution } from "./git-merge.ts";
import { getProjectDirectory } from "./storage.ts";

import { encryptSecret, decryptSecret } from "../helpers/encryption.ts";
import { reconcileProjectDocumentState } from "./git-document-state.ts";
import { ProjectGitContentError, syncSupportedFiles } from "./git-files.ts";

export { ProjectGitContentError };

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
	folder: string;
	hasCredentials: boolean;
	username: string | null;
};

export class ProjectGitRemoteError extends Error {}
export class ProjectGitNotConfiguredError extends Error {}

/** Always pass full refs: isomorphic-git writes a bare branch name to `.git/<name>` instead of `refs/heads/`. */
function branchRef(branch: string): string {
	return `refs/heads/${branch}`;
}

function authOptions(credentials: GitCredentials) {
	if (!credentials.token) {
		return {};
	}

	return {
		onAuth: () => ({
			username: credentials.username || "git",
			password: credentials.token,
		}),
	};
}

function credentialsPath(dir: string): string {
	return join(dir, ".git", CREDENTIALS_FILE);
}

async function readCredentials(projectId: string, dir: string): Promise<GitCredentials> {
	try {
		const credentials = JSON.parse(
			decryptSecret(
				await readFile(credentialsPath(dir), "utf8"),
				"marp-collab-git-credentials",
				projectId,
			),
		) as StoredCredentials;

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
	await writeFile(
		credentialsPath(dir),
		encryptSecret(plaintext, "marp-collab-git-credentials", projectId),
		{ mode: 0o600 },
	);
}

async function repositoryDirectory(projectId: string): Promise<string> {
	const dir = join(await getProjectDirectory(projectId), ".git", "repository");
	await mkdir(dir, { recursive: true });
	return dir;
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
	const changed = await stageProjectFiles(dir);
	const hasHead = await git.resolveRef({ fs, dir, ref: branchRef(branch) }).then(
		() => true,
		() => false,
	);
	if (!changed && hasHead) {
		return;
	}

	await git.commit({
		fs,
		dir,
		ref: branchRef(branch),
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
	const dir = await repositoryDirectory(projectId);
	if (!(await hasGitDirectory(dir))) {
		throw new ProjectGitNotConfiguredError("Git sync is not configured");
	}

	const [storedBranch, currentBranch, remotes, credentials] = await Promise.all([
		git.getConfig({ fs, dir, path: "marp.branch" }) as Promise<string | undefined>,
		git.currentBranch({ fs, dir, fullname: false }),
		git.listRemotes({ fs, dir }),
		readCredentials(projectId, dir),
	]);
	const origin = remotes.find((remote) => remote.remote === REMOTE);
	if (!origin) {
		throw new ProjectGitNotConfiguredError("Git sync is not configured");
	}

	const folder = (await git.getConfig({ fs, dir, path: "marp.folder" })) ?? "";
	const branch = storedBranch || currentBranch || "main";
	return { dir, branch, remoteUrl: origin.url, credentials, folder };
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
		const { remoteUrl, branch, credentials, folder } = await getConfiguredProject(projectId);
		return {
			configured: true,
			folder,
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
			folder: "",
			remoteUrl: null,
			branch: "main",
			hasCredentials: false,
			username: null,
		};
	}
}

type ProjectGitSettings = {
	projectId: string;
	remoteUrl: string;
	branch: string;
	credentials: GitCredentials;
	folder?: string;
};

/** A token is kept only while the remote URL stays the same, so it is never sent to another host. */
async function resolveCredentials(
	projectId: string,
	remoteUrl: string,
	credentials: GitCredentials,
): Promise<GitCredentials> {
	const existingConfig = await getProjectGitConfig(projectId);
	const existing =
		existingConfig.remoteUrl === remoteUrl
			? await readCredentials(projectId, await repositoryDirectory(projectId))
			: {};
	return {
		username: credentials.username ?? existing.username,
		token: credentials.token || existing.token,
	};
}

/** Checks that the remote accepts the credentials, without changing any settings. */
export async function verifyProjectGitRemote({
	projectId,
	remoteUrl,
	credentials,
}: Pick<ProjectGitSettings, "projectId" | "remoteUrl" | "credentials">): Promise<void> {
	const effectiveCredentials = await resolveCredentials(projectId, remoteUrl, credentials);
	try {
		// Send supplied credentials on the first request, including for public remotes.
		await git.listServerRefs({
			http,
			url: remoteUrl,
			...authOptions(effectiveCredentials),
			headers: effectiveCredentials.token
				? {
						Authorization: `Basic ${Buffer.from(`${effectiveCredentials.username || "git"}:${effectiveCredentials.token}`).toString("base64")}`,
					}
				: undefined,
		});
	} catch {
		throw new ProjectGitRemoteError(
			"Could not access the Git repository. Check the URL, username and access token.",
		);
	}
}

/** Stores verified settings. Run while the project's Git sync lock is held. */
export async function saveProjectGitConfig({
	projectId,
	remoteUrl,
	branch,
	credentials,
	folder = "",
}: ProjectGitSettings): Promise<ProjectGitConfig> {
	const dir = await repositoryDirectory(projectId);
	const existingConfig = await getProjectGitConfig(projectId);
	const effectiveCredentials = await resolveCredentials(projectId, remoteUrl, credentials);
	if (
		existingConfig.configured &&
		(existingConfig.remoteUrl !== remoteUrl ||
			existingConfig.branch !== branch ||
			existingConfig.folder !== folder)
	) {
		await rm(dir, { recursive: true, force: true });
		await mkdir(dir, { recursive: true });
	}

	if (!(await hasGitDirectory(dir))) {
		await git.init({ fs, dir, defaultBranch: branch });
	}

	const currentBranch = await git.currentBranch({ fs, dir, fullname: false });
	if (currentBranch && currentBranch !== branch) {
		await git.renameBranch({ fs, dir, oldref: currentBranch, ref: branch, checkout: true });
	}

	await git.addRemote({ fs, dir, remote: REMOTE, url: remoteUrl, force: true });
	await configureBranch(dir, branch);
	await git.setConfig({ fs, dir, path: "marp.branch", value: branch });
	await git.setConfig({ fs, dir, path: "marp.folder", value: folder });
	await saveCredentials(projectId, dir, effectiveCredentials);

	return getProjectGitConfig(projectId);
}

export async function configureProjectGit(settings: ProjectGitSettings): Promise<ProjectGitConfig> {
	await verifyProjectGitRemote(settings);
	return saveProjectGitConfig(settings);
}

export async function pullProjectFromGit({
	projectId,
	author,
	resolutions,
}: {
	projectId: string;
	author: GitAuthor;
	resolutions?: Record<string, ProjectGitResolution>;
}): Promise<{ commit: string; pulled: boolean; overlapping: string[] }> {
	const { dir, remoteUrl, branch, credentials, folder } = await getConfiguredProject(projectId);
	const ref = branchRef(branch);
	await configureBranch(dir, branch);
	await syncSupportedFiles(await getProjectDirectory(projectId), join(dir, folder));
	await commitProjectFiles(dir, branch, author);

	const remoteBranch = await getRemoteBranch(dir, remoteUrl, branch, credentials);
	let pulled = false;
	let overlapping: string[] = [];

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

		const previousCommit = await git.resolveRef({ fs, dir, ref });
		try {
			const merge = await mergeProjectBranches({
				dir,
				ours: ref,
				theirs: `refs/remotes/${REMOTE}/${branch}`,
				author,
				resolutions,
			});
			pulled = !merge.alreadyMerged;
			overlapping = merge.overlapping;

			if (pulled) {
				await git.checkout({ fs, dir, ref, force: true });
				await syncSupportedFiles(join(dir, folder), await getProjectDirectory(projectId));
				await reconcileProjectDocumentState(projectId);
			}
		} catch (error) {
			// Otherwise the next sync would commit the stale project files on top of the merge and push a revert.
			await git.writeRef({ fs, dir, ref, value: previousCommit, force: true });
			await git.checkout({ fs, dir, ref, force: true });
			throw error;
		}
	}

	return { commit: await git.resolveRef({ fs, dir, ref }), pulled, overlapping };
}

export async function pushProjectToGit({
	projectId,
	author,
}: {
	projectId: string;
	author: GitAuthor;
}): Promise<{ commit: string; pushed: boolean }> {
	const { dir, remoteUrl, branch, credentials, folder } = await getConfiguredProject(projectId);
	await configureBranch(dir, branch);
	await syncSupportedFiles(await getProjectDirectory(projectId), join(dir, folder));
	await commitProjectFiles(dir, branch, author);

	const [remoteBranch, commit] = await Promise.all([
		getRemoteBranch(dir, remoteUrl, branch, credentials),
		git.resolveRef({ fs, dir, ref: branchRef(branch) }),
	]);
	const pushed = remoteBranch?.oid !== commit;
	if (pushed) {
		await git.push({
			fs,
			http,
			dir,
			remote: REMOTE,
			ref: branchRef(branch),
			remoteRef: branchRef(branch),
			...authOptions(credentials),
		});
	}

	return { commit, pushed };
}

/** Removes the repository, settings and stored access token; project files stay untouched. */
export async function disconnectProjectGit(projectId: string): Promise<void> {
	await rm(join(await getProjectDirectory(projectId), ".git", "repository"), {
		recursive: true,
		force: true,
	});
}
