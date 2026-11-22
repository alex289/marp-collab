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
import { configureBranchTracking, PROJECT_GIT_REMOTE, type GitAuthor } from "./git-repository.ts";
import {
	ProjectGitRejectedError,
	ProjectGitRemoteError,
	ProjectGitTransportError,
	type GitCredentials,
} from "./git-tasks.ts";

export {
	ProjectGitContentError,
	ProjectGitProcessError,
	ProjectGitRejectedError,
	ProjectGitRemoteError,
	ProjectGitTransportError,
};

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
	const path = credentialsPath(dir);
	if (!credentials.token) {
		await rm(path, { force: true });
		return;
	}

	const plaintext = JSON.stringify(credentials);
	await writeFile(path, encryptSecret(plaintext, "marp-collab-git-credentials", projectId), {
		mode: 0o600,
	});
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

export function isProjectGitConfigured(projectId: string): Promise<boolean> {
	return hasGitDirectory(repositoryDirectory(projectId));
}

async function readConfiguredProject(projectId: string) {
	const dir = repositoryDirectory(projectId);
	if (!(await hasGitDirectory(dir))) {
		return null;
	}

	const [storedBranch, currentBranch, remotes, credentials] = await Promise.all([
		git.getConfig({ fs, dir, path: "marp.branch" }) as Promise<string | undefined>,
		git.currentBranch({ fs, dir, fullname: false }),
		git.listRemotes({ fs, dir }),
		readCredentials(projectId, dir),
	]);
	const origin = remotes.find((remote) => remote.remote === PROJECT_GIT_REMOTE);
	if (!origin) {
		return null;
	}

	const folder = (await git.getConfig({ fs, dir, path: "marp.folder" })) ?? "";
	const branch = storedBranch || currentBranch || "main";
	return { dir, branch, remoteUrl: origin.url, credentials, folder };
}

async function getConfiguredProject(projectId: string) {
	const config = await readConfiguredProject(projectId);
	if (!config) {
		throw new ProjectGitNotConfiguredError("Git sync is not configured");
	}
	return config;
}

export async function getProjectGitConfig(projectId: string): Promise<ProjectGitConfig> {
	const config = await readConfiguredProject(projectId);
	if (!config) {
		return {
			configured: false,
			folder: "",
			remoteUrl: null,
			branch: "main",
			hasCredentials: false,
			username: null,
		};
	}
	const { remoteUrl, branch, credentials, folder } = config;
	return {
		configured: true,
		folder,
		remoteUrl,
		branch,
		hasCredentials: Boolean(credentials.token),
		username: credentials.username ?? null,
	};
}

export type ProjectGitSettings = {
	projectId: string;
	remoteUrl: string;
	branch: string;
	credentials: GitCredentials;
	folder?: string;
};

type ResolvedProjectGitSettings = Omit<ProjectGitSettings, "credentials"> & {
	credentials: { username: string | undefined; token: string | undefined };
};

/** Read remote metadata and its saved credentials while the repository is reserved. */
export async function resolveProjectGitSettings(
	settings: ProjectGitSettings,
): Promise<ResolvedProjectGitSettings> {
	const current = await readConfiguredProject(settings.projectId);
	const retainedCredentials = current?.remoteUrl === settings.remoteUrl ? current.credentials : {};
	return {
		...settings,
		credentials: {
			username: settings.credentials.username ?? retainedCredentials.username,
			token: settings.credentials.token || retainedCredentials.token,
		},
	};
}

/** Verify outside the repository lock. The returned write uses the verified credentials. */
export async function prepareProjectGitConfig(settings: ResolvedProjectGitSettings) {
	await runGitTask({
		type: "verify",
		remoteUrl: settings.remoteUrl,
		credentials: settings.credentials,
	});
	return () => saveProjectGitConfig(settings);
}

async function saveProjectGitConfig({
	projectId,
	remoteUrl,
	branch,
	credentials,
	folder = "",
}: ProjectGitSettings): Promise<ProjectGitConfig> {
	const dir = repositoryDirectory(projectId);
	const existingConfig = await readConfiguredProject(projectId);
	if (
		existingConfig &&
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

	await git.addRemote({ fs, dir, remote: PROJECT_GIT_REMOTE, url: remoteUrl, force: true });
	await configureBranchTracking(dir, branch);
	await git.setConfig({ fs, dir, path: "marp.branch", value: branch });
	await git.setConfig({ fs, dir, path: "marp.folder", value: folder });
	await saveCredentials(projectId, dir, credentials);

	return getProjectGitConfig(projectId);
}

/** Finish a pending rollback before committing an incomplete working tree. */
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
	message,
}: {
	projectId: string;
	author: GitAuthor;
	resolutions?: Record<string, ProjectGitResolution>;
	message?: string;
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
		message,
	});
	// Until the project files are updated, committing them would revert the pull.
	// Persist the rollback target so the next sync can recover after a restart.
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
	message,
}: {
	projectId: string;
	author: GitAuthor;
	message?: string;
}): Promise<{ commit: string; committed: boolean; pushed: boolean }> {
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
		message,
	});
}

/** Removes the repository, settings and stored access token; project files stay untouched. */
export async function removeProjectGitRepository(projectId: string): Promise<void> {
	await rm(repositoryDirectory(projectId), {
		recursive: true,
		force: true,
	});
}
