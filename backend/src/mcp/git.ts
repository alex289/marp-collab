import { getUserById } from "../db/models/user.ts";
import {
	ProjectDeletedError,
	ProjectGitBusyError,
	ProjectGitServerBusyError,
	syncProjectWithGit,
	type ProjectGitAction,
} from "../projects/git-actions.ts";
import { ProjectGitNetworkError } from "../projects/git-http.ts";
import { ProjectGitConflictError } from "../projects/git-merge.ts";
import {
	ProjectGitContentError,
	ProjectGitNotConfiguredError,
	ProjectGitProcessError,
	ProjectGitRejectedError,
	ProjectGitTransportError,
} from "../projects/git-sync.ts";
import { PresentationToolError, requirePresentationAccess } from "./presentations.ts";

/** Converts errors whose messages are safe to show into tool errors the assistant can act on. */
function toToolError(error: unknown): unknown {
	if (error instanceof ProjectDeletedError) {
		return new PresentationToolError("Project not found or access denied.");
	}
	if (error instanceof ProjectGitNotConfiguredError) {
		return new PresentationToolError(
			"Git sync is not configured for this project. The project owner can connect a repository in the app.",
		);
	}
	if (error instanceof ProjectGitConflictError) {
		return new PresentationToolError(
			`${error.message}. Ask the user which version to keep for each path, then call pull_from_git again with resolutions set to "project" or "remote" per path. Conflicts: ${JSON.stringify(error.conflicts)}`,
		);
	}
	if (error instanceof ProjectGitRejectedError) {
		return new PresentationToolError(`${error.message}. Call pull_from_git, then push again.`);
	}
	if (
		error instanceof ProjectGitBusyError ||
		error instanceof ProjectGitServerBusyError ||
		error instanceof ProjectGitNetworkError ||
		error instanceof ProjectGitContentError ||
		error instanceof ProjectGitTransportError ||
		(error instanceof ProjectGitProcessError && error.exceededLimit)
	) {
		return new PresentationToolError(error.message);
	}
	return error;
}

export async function syncPresentationProject(
	projectId: string,
	userId: string,
	action: ProjectGitAction,
) {
	requirePresentationAccess(projectId, userId, true);
	const user = getUserById(userId);
	if (!user) {
		throw new PresentationToolError("Project not found or access denied.");
	}
	try {
		const result = await syncProjectWithGit(
			projectId,
			{ name: user.name || user.email, email: user.email },
			action,
		);
		return { projectId, ...result };
	} catch (error) {
		throw toToolError(error);
	}
}
