import { z } from "zod";
import {
	broadcastFilesChanged,
	broadcastGitSyncFinished,
	flushAndCloseProjectDocuments,
} from "../collab/project-events.ts";
import { getProjectById } from "../db/models/project.ts";
import { getUserById } from "../db/models/user.ts";
import { getProjectAuthorization } from "./access-policy.ts";
import { ProjectGitNetworkError } from "./git-http.ts";
import {
	ProjectGitConflictError,
	type ProjectGitConflict,
	type ProjectGitResolution,
} from "./git-merge.ts";
import {
	beginGitOperation,
	finishProjectGitConfigure,
	finishProjectGitSync,
	startProjectGitConfigure,
	startProjectGitSync,
	waitForProjectWrites,
} from "./git-sync-lock.ts";
import {
	getProjectGitConfig,
	ProjectGitContentError,
	ProjectGitNotConfiguredError,
	ProjectGitProcessError,
	ProjectGitRejectedError,
	ProjectGitRemoteError,
	ProjectGitTransportError,
	pullProjectFromGit,
	pushProjectToGit,
} from "./git-sync.ts";
import { MAX_REPORTED_CONFLICTS } from "./git-tasks.ts";

export class ProjectDeletedError extends Error {}
/** The user may not change the project, or lost write access while the sync waited. */
export class ProjectGitAccessError extends Error {}
/** Another sync or settings change holds the project's repository. */
export class ProjectGitBusyError extends Error {}
/** The server already runs as many Git operations as it allows. */
export class ProjectGitServerBusyError extends Error {}

/** A pull reports at most this many conflicts, so it never needs more resolutions. */
export const projectGitResolutionsSchema = z
	.record(z.string().max(4096), z.enum(["project", "remote"]))
	.refine((resolutions) => Object.keys(resolutions).length <= MAX_REPORTED_CONFLICTS, {
		message: `Resolve at most ${MAX_REPORTED_CONFLICTS} paths at once`,
	});

export type ProjectGitAction =
	| { type: "pull"; resolutions?: Record<string, ProjectGitResolution> }
	| { type: "push"; message?: string };

export type ProjectGitFailure =
	| {
			kind:
				| "deleted"
				| "forbidden"
				| "busy"
				| "server-busy"
				| "invalid"
				| "not-configured"
				| "rejected"
				| "transport";
			message: string;
	  }
	| { kind: "conflict"; message: string; conflicts: ProjectGitConflict[] };

/** Classifies Git errors whose messages are safe to show; returns null for unexpected errors. */
export function classifyGitError(error: unknown): ProjectGitFailure | null {
	if (error instanceof ProjectDeletedError) {
		return { kind: "deleted", message: error.message };
	}
	if (error instanceof ProjectGitAccessError) {
		return { kind: "forbidden", message: error.message };
	}
	if (error instanceof ProjectGitBusyError) {
		return { kind: "busy", message: error.message };
	}
	if (error instanceof ProjectGitServerBusyError) {
		return { kind: "server-busy", message: error.message };
	}
	if (error instanceof ProjectGitConflictError) {
		return { kind: "conflict", message: error.message, conflicts: error.conflicts };
	}
	if (error instanceof ProjectGitNotConfiguredError) {
		return { kind: "not-configured", message: error.message };
	}
	if (error instanceof ProjectGitRejectedError) {
		return { kind: "rejected", message: error.message };
	}
	if (error instanceof ProjectGitTransportError) {
		return { kind: "transport", message: error.message };
	}
	if (
		error instanceof ProjectGitRemoteError ||
		error instanceof ProjectGitNetworkError ||
		error instanceof ProjectGitContentError ||
		(error instanceof ProjectGitProcessError && error.exceededLimit)
	) {
		return { kind: "invalid", message: error.message };
	}
	return null;
}

/** Deleting a project holds its Git lock, so a deletion has finished if the project is gone now. */
function assertProjectExists(projectId: string): void {
	if (!getProjectById(projectId)) {
		throw new ProjectDeletedError("Project not found");
	}
}

function assertWriteAccess(projectId: string, userId: string): void {
	if (!getProjectAuthorization(projectId, userId, "write").allowed) {
		throw new ProjectGitAccessError("You do not have write access to this project");
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

/** Pulls or pushes a project as the given user after saving and closing open documents. */
export async function syncProjectWithGit(
	projectId: string,
	userId: string,
	action: ProjectGitAction,
) {
	assertWriteAccess(projectId, userId);
	const user = getUserById(userId);
	if (!user) {
		throw new ProjectGitAccessError("You do not have write access to this project");
	}
	// Syncing disconnects every editor, so do not start one that cannot succeed.
	if (!(await getProjectGitConfig(projectId)).configured) {
		throw new ProjectGitNotConfiguredError("Git sync is not configured");
	}
	const author = { name: user.name || user.email, email: user.email };
	return withGitOperation(() =>
		withProjectSyncLock(projectId, async () => {
			await waitForProjectWrites(projectId);
			await flushAndCloseProjectDocuments(projectId);
			// Access may have been revoked while earlier writes finished.
			assertWriteAccess(projectId, userId);
			return action.type === "pull"
				? pullProjectFromGit({ projectId, author, resolutions: action.resolutions })
				: pushProjectToGit({ projectId, author, message: action.message });
		}),
	);
}
