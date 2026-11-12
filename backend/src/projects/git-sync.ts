import fs from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import git from "isomorphic-git";
import { ProjectGitConflictError, type ProjectGitResolution } from "./git-merge.ts";
import { getProjectDirectory, getProjectDirectoryPath } from "./storage.ts";

import { encryptSecret, decryptSecret } from "../helpers/encryption.ts";
import { logger } from "../helpers/logger.ts";
import { reconcileProjectDocumentState } from "./git-document-state.ts";
import { ProjectGitContentError, syncSupportedFiles } from "./git-files.ts";
import { ProjectGitProcessError, runGitTask } from "./git-process.ts";
import {
	ProjectGitRejectedError,
	ProjectGitRemoteError,
	ProjectGitTransportError,
	type GitAuthor,
	type GitCredentials,
} from "./git-tasks.ts";

export {
	ProjectGitContentError,
	ProjectGitProcessError,
	ProjectGitRejectedError,
	ProjectGitRemoteError,
	ProjectGitTransportError,
};

const REMOTE = "origin";
const CREDENTIALS_FILE = "marp-collab-credentials";
/** Holds the commit to reset to while a rollback has not finished. */
const RESET_FILE = "marp-collab-reset";

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

export class ProjectGitNotConfiguredError extends Error {}

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

/** Reading settings must not create directories: it also runs outside the lock that deletion holds. */
function repositoryDirectory(projectId: string): string {
	return join(getProjectDirectoryPath(projectId), ".git", "repository");
}

async function hasGitDirectory(dir: string): Promise<boolean> {
	try {
		await access(join(dir, ".git"));
		return true;
	} catch {
		return false;
	}
}

async function getConfiguredProject(projectId: string) {
	const dir = repositoryDirectory(projectId);
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
			? await readCredentials(projectId, repositoryDirectory(projectId))
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
	await runGitTask({
		type: "verify",
		remoteUrl,
		credentials: await resolveCredentials(projectId, remoteUrl, credentials),
	});
}

/** Stores verified settings. Run while the project's Git sync lock is held. */
export async function saveProjectGitConfig({
	projectId,
	remoteUrl,
	branch,
	credentials,
	folder = "",
}: ProjectGitSettings): Promise<ProjectGitConfig> {
	const dir = repositoryDirectory(projectId);
	const existingConfig = await getProjectGitConfig(projectId);
	const effectiveCredentials = await resolveCredentials(projectId, remoteUrl, credentials);
	if (
		existingConfig.configured &&
		(existingConfig.remoteUrl !== remoteUrl ||
			existingConfig.branch !== branch ||
			existingConfig.folder !== folder)
	) {
		await rm(dir, { recursive: true, force: true });
	}

	await mkdir(dir, { recursive: true });
	if (!(await hasGitDirectory(dir))) {
		await git.init({ fs, dir, defaultBranch: branch });
	}

	const currentBranch = await git.currentBranch({ fs, dir, fullname: false });
	if (currentBranch && currentBranch !== branch) {
		await git.renameBranch({ fs, dir, oldref: currentBranch, ref: branch, checkout: true });
	}

	await git.addRemote({ fs, dir, remote: REMOTE, url: remoteUrl, force: true });
	await git.setConfig({ fs, dir, path: `branch.${branch}.remote`, value: REMOTE });
	await git.setConfig({ fs, dir, path: `branch.${branch}.merge`, value: `refs/heads/${branch}` });
	await git.setConfig({ fs, dir, path: "marp.branch", value: branch });
	await git.setConfig({ fs, dir, path: "marp.folder", value: folder });
	await saveCredentials(projectId, dir, effectiveCredentials);

	return getProjectGitConfig(projectId);
}

export async function configureProjectGit(settings: ProjectGitSettings): Promise<ProjectGitConfig> {
	await verifyProjectGitRemote(settings);
	return saveProjectGitConfig(settings);
}

/**
 * Completes a rollback that was interrupted, before anything new is committed: the repository's
 * working tree may be missing files, which a commit would record as deleted.
 */
async function finishRollback(dir: string, branch: string): Promise<void> {
	const marker = join(dir, ".git", RESET_FILE);
	const commit = await readFile(marker, "utf8").catch(() => null);
	if (commit) {
		await runGitTask({ type: "reset", repository: dir, branch, commit: commit.trim() });
		await rm(marker);
	}
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
	const projectDirectory = await getProjectDirectory(projectId);
	const repository = { repository: dir, branch };
	await finishRollback(dir, branch);
	const commit = await runGitTask({
		type: "commit",
		...repository,
		projectDirectory,
		folder,
		author,
	});
	// Until the pulled files are in the project, the repository is ahead of it, and committing the
	// project would push a revert. So whatever stops the pull, even a server restart, the next sync
	// rolls the repository back first.
	const marker = join(dir, ".git", RESET_FILE);
	await writeFile(marker, commit);
	const rollBack = async () => {
		try {
			await finishRollback(dir, branch);
		} catch (error) {
			logger.error(
				{ projectId, error },
				"Rolling back a failed Git pull failed; retrying on next sync",
			);
		}
	};

	let pull;
	try {
		pull = await runGitTask({
			type: "pull",
			...repository,
			remoteUrl,
			credentials,
			author,
			resolutions,
		});
	} catch (error) {
		// Conflicts are found before anything changes; other failures may have stopped half way.
		if (error instanceof ProjectGitConflictError) {
			await rm(marker);
		} else {
			await rollBack();
		}
		throw error;
	}
	if (pull.pulled) {
		try {
			await syncSupportedFiles(join(dir, folder), projectDirectory, { intoProject: true });
			await reconcileProjectDocumentState(projectId);
		} catch (error) {
			// Keep collaboration state in line with whatever files were copied before the failure.
			await reconcileProjectDocumentState(projectId).catch((reconcileError: unknown) =>
				logger.error({ projectId, error: reconcileError }, "Updating collaboration state failed"),
			);
			await rollBack();
			throw error;
		}
	}
	await rm(marker);

	return pull;
}

export async function pushProjectToGit({
	projectId,
	author,
}: {
	projectId: string;
	author: GitAuthor;
}): Promise<{ commit: string; pushed: boolean }> {
	const { dir, remoteUrl, branch, credentials, folder } = await getConfiguredProject(projectId);
	await finishRollback(dir, branch);
	return runGitTask({
		type: "push",
		repository: dir,
		branch,
		projectDirectory: await getProjectDirectory(projectId),
		folder,
		remoteUrl,
		credentials,
		author,
	});
}

/** Removes the repository, settings and stored access token; project files stay untouched. */
export async function disconnectProjectGit(projectId: string): Promise<void> {
	await rm(join(await getProjectDirectory(projectId), ".git", "repository"), {
		recursive: true,
		force: true,
	});
}
