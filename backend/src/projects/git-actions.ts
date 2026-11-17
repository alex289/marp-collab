import {
	broadcastFilesChanged,
	broadcastGitSyncFinished,
	flushAndCloseProjectDocuments,
} from "../collab/project-events.ts";
import { getProjectById } from "../db/models/project.ts";
import type { ProjectGitResolution } from "./git-merge.ts";
import {
	beginGitOperation,
	finishProjectGitConfigure,
	finishProjectGitSync,
	startProjectGitConfigure,
	startProjectGitSync,
	waitForProjectWrites,
} from "./git-sync-lock.ts";
import { pullProjectFromGit, pushProjectToGit } from "./git-sync.ts";
import type { GitAuthor } from "./git-tasks.ts";

export class ProjectDeletedError extends Error {}
/** Another sync or settings change holds the project's repository. */
export class ProjectGitBusyError extends Error {}
/** The server already runs as many Git operations as it allows. */
export class ProjectGitServerBusyError extends Error {}

export type ProjectGitAction =
	| { type: "pull"; resolutions?: Record<string, ProjectGitResolution> }
	| { type: "push"; message?: string };

/** Deleting a project holds its Git lock, so a deletion has finished if the project is gone now. */
function assertProjectExists(projectId: string): void {
	if (!getProjectById(projectId)) {
		throw new ProjectDeletedError("Project not found");
	}
}

/** Holds a server-wide Git operation slot while `run` executes. */
export async function withGitOperation<T>(run: () => Promise<T>): Promise<T> {
	const release = beginGitOperation();
	if (!release) {
		throw new ProjectGitServerBusyError("Too many Git syncs are running. Try again shortly.");
	}
	try {
		return await run();
	} finally {
		release();
	}
}

/** Holds the project's Git repository for a settings change; editors keep working meanwhile. */
export async function withProjectConfigureLock<T>(
	projectId: string,
	run: () => Promise<T>,
): Promise<T> {
	if (!startProjectGitConfigure(projectId)) {
		throw new ProjectGitBusyError("This project is already syncing");
	}
	try {
		assertProjectExists(projectId);
		return await run();
	} finally {
		finishProjectGitConfigure(projectId);
	}
}

/** Holds the project's sync lock, which makes editors wait and reconnect once it is released. */
async function withProjectSyncLock<T>(projectId: string, run: () => Promise<T>): Promise<T> {
	if (!startProjectGitSync(projectId)) {
		throw new ProjectGitBusyError("This project is already syncing");
	}
	try {
		assertProjectExists(projectId);
		return await run();
	} finally {
		finishProjectGitSync(projectId);
		broadcastFilesChanged(projectId);
		broadcastGitSyncFinished(projectId);
	}
}

/** Pulls or pushes a project after saving open documents. Callers check write access. */
export function syncProjectWithGit(projectId: string, author: GitAuthor, action: ProjectGitAction) {
	return withGitOperation(() =>
		withProjectSyncLock(projectId, async () => {
			await waitForProjectWrites(projectId);
			await flushAndCloseProjectDocuments(projectId);
			return action.type === "pull"
				? pullProjectFromGit({ projectId, author, resolutions: action.resolutions })
				: pushProjectToGit({ projectId, author, message: action.message });
		}),
	);
}
