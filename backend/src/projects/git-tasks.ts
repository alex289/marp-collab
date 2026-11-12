import fs from "node:fs";
import { join } from "node:path";
import git from "isomorphic-git";
import { ProjectGitContentError, syncSupportedFiles } from "./git-files.ts";
import { projectGitHttp as http, ProjectGitNetworkError } from "./git-http.ts";
import {
	mergeProjectBranches,
	ProjectGitConflictError,
	type ProjectGitConflict,
	type ProjectGitResolution,
} from "./git-merge.ts";

/*
 * Every operation here reads objects that came from a Git remote. isomorphic-git unpacks those
 * without memory or time limits, so git-process.ts runs these tasks in a separate process.
 */

const REMOTE = "origin";

export type GitAuthor = {
	name: string;
	email: string;
};

export type GitCredentials = {
	username?: string;
	token?: string;
};

export class ProjectGitRemoteError extends Error {}
/** The remote or merge refused the change; the user has to pull or resolve conflicts first. */
export class ProjectGitRejectedError extends Error {}
export class ProjectGitTransportError extends Error {}

type Repository = {
	repository: string;
	branch: string;
};

type Remote = Repository & {
	remoteUrl: string;
	credentials: GitCredentials;
};

type ProjectFiles = Repository & {
	projectDirectory: string;
	folder: string;
	author: GitAuthor;
};

export type GitTask =
	| { type: "verify"; remoteUrl: string; credentials: GitCredentials }
	| ({ type: "commit" } & ProjectFiles)
	| ({
			type: "pull";
			author: GitAuthor;
			resolutions?: Record<string, ProjectGitResolution>;
	  } & Remote)
	| ({ type: "reset"; commit: string } & Repository)
	| ({ type: "push" } & ProjectFiles & Remote);

type GitTaskResults = {
	verify: undefined;
	commit: string;
	pull: { commit: string; pulled: boolean; overlapping: string[] };
	reset: undefined;
	push: { commit: string; pushed: boolean };
};

export type GitTaskResult<T extends GitTask> = GitTaskResults[T["type"]];

export type SerializedGitError =
	| { type: "conflict"; conflicts: ProjectGitConflict[] }
	| {
			type: "content" | "network" | "remote" | "rejected" | "transport" | "failed";
			message: string;
	  };

export type GitTaskReply =
	| { ok: true; result: GitTaskResults[keyof GitTaskResults] }
	| { ok: false; error: SerializedGitError };

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

async function assertNoSymlinks(dir: string, tree: ReturnType<typeof git.TREE>): Promise<void> {
	await git.walk({
		fs,
		dir,
		trees: [tree],
		map: async (filepath, [entry]) => {
			if (entry && (await entry.mode()) === 0o120000) {
				throw new ProjectGitContentError(`Symbolic links are not supported: ${filepath}`);
			}
		},
	});
}

async function stageProjectFiles(dir: string): Promise<boolean> {
	await assertNoSymlinks(dir, git.WORKDIR());

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

async function configureBranch(dir: string, branch: string): Promise<void> {
	await git.setConfig({ fs, dir, path: `branch.${branch}.remote`, value: REMOTE });
	await git.setConfig({ fs, dir, path: `branch.${branch}.merge`, value: branchRef(branch) });
}

/** Copies the project's files into the repository and commits them. Returns the branch's commit. */
async function commitProjectFiles({
	repository: dir,
	branch,
	projectDirectory,
	folder,
	author,
}: ProjectFiles): Promise<string> {
	const ref = branchRef(branch);
	await configureBranch(dir, branch);
	await syncSupportedFiles(projectDirectory, join(dir, folder));
	const changed = await stageProjectFiles(dir);
	const hasHead = await git.resolveRef({ fs, dir, ref }).then(
		() => true,
		() => false,
	);
	if (changed || !hasHead) {
		await git.commit({ fs, dir, ref, message: "Sync project files", author });
	}

	return git.resolveRef({ fs, dir, ref });
}

async function getRemoteBranch({ remoteUrl, branch, credentials }: Remote) {
	const refs = await git.listServerRefs({
		http,
		url: remoteUrl,
		prefix: branchRef(branch),
		...authOptions(credentials),
	});

	return refs.find((ref) => ref.ref === branchRef(branch));
}

/** Checks that the remote accepts the credentials. */
async function verifyRemote(remoteUrl: string, credentials: GitCredentials): Promise<undefined> {
	try {
		// Send supplied credentials on the first request, including for public remotes.
		await git.listServerRefs({
			http,
			url: remoteUrl,
			...authOptions(credentials),
			headers: credentials.token
				? {
						Authorization: `Basic ${Buffer.from(`${credentials.username || "git"}:${credentials.token}`).toString("base64")}`,
					}
				: undefined,
		});
	} catch {
		throw new ProjectGitRemoteError(
			"Could not access the Git repository. Check the URL, username and access token.",
		);
	}
	return undefined;
}

async function resetBranch({ repository: dir, branch, commit }: Repository & { commit: string }) {
	const ref = branchRef(branch);
	await git.writeRef({ fs, dir, ref, value: commit, force: true });
	await git.checkout({ fs, dir, ref, force: true });
	return undefined;
}

/** Fetches and merges the remote branch into the repository, leaving the project's files alone. */
async function pullRemote({
	author,
	resolutions,
	...remote
}: Extract<GitTask, { type: "pull" }>): Promise<GitTaskResults["pull"]> {
	const { repository: dir, branch, credentials } = remote;
	const ref = branchRef(branch);
	const remoteRef = `refs/remotes/${REMOTE}/${branch}`;
	let pulled = false;
	let overlapping: string[] = [];

	if (await getRemoteBranch(remote)) {
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
		await assertNoSymlinks(dir, git.TREE({ ref: remoteRef }));

		const commit = await git.resolveRef({ fs, dir, ref });
		try {
			const merge = await mergeProjectBranches({
				dir,
				ours: ref,
				theirs: remoteRef,
				author,
				resolutions,
			});
			pulled = !merge.alreadyMerged;
			overlapping = merge.overlapping;
			if (pulled) {
				await git.checkout({ fs, dir, ref, force: true });
			}
		} catch (error) {
			await resetBranch({ ...remote, commit });
			throw error;
		}
	}

	return { commit: await git.resolveRef({ fs, dir, ref }), pulled, overlapping };
}

async function pushProject(
	task: Extract<GitTask, { type: "push" }>,
): Promise<GitTaskResults["push"]> {
	const commit = await commitProjectFiles(task);
	const remoteBranch = await getRemoteBranch(task);
	const pushed = remoteBranch?.oid !== commit;
	if (pushed) {
		await git.push({
			fs,
			http,
			dir: task.repository,
			remote: REMOTE,
			ref: branchRef(task.branch),
			remoteRef: branchRef(task.branch),
			...authOptions(task.credentials),
		});
	}

	return { commit, pushed };
}

export function handleGitTask(task: GitTask): Promise<GitTaskResults[keyof GitTaskResults]> {
	switch (task.type) {
		case "verify":
			return verifyRemote(task.remoteUrl, task.credentials);
		case "commit":
			return commitProjectFiles(task);
		case "pull":
			return pullRemote(task);
		case "reset":
			return resetBranch(task);
		case "push":
			return pushProject(task);
	}
}

/** Error classes do not survive the process boundary, so errors travel as plain data. */
export function serializeGitError(error: unknown): SerializedGitError {
	if (error instanceof ProjectGitConflictError) {
		return { type: "conflict", conflicts: error.conflicts };
	}
	if (error instanceof ProjectGitContentError) {
		return { type: "content", message: error.message };
	}
	if (error instanceof ProjectGitNetworkError) {
		return { type: "network", message: error.message };
	}
	if (error instanceof ProjectGitRemoteError) {
		return { type: "remote", message: error.message };
	}
	if (error instanceof git.Errors.MergeConflictError) {
		return {
			type: "rejected",
			message: "Git pull stopped because remote changes conflict with this project",
		};
	}
	if (error instanceof git.Errors.GitPushError || error instanceof git.Errors.PushRejectedError) {
		return { type: "rejected", message: "The Git remote has changes; pull before pushing" };
	}
	if (
		error instanceof git.Errors.HttpError ||
		error instanceof git.Errors.SmartHttpError ||
		error instanceof git.Errors.UnknownTransportError
	) {
		return { type: "transport", message: "Could not connect to the Git remote or authenticate" };
	}
	return {
		type: "failed",
		message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
	};
}

export function deserializeGitError(error: SerializedGitError): Error {
	switch (error.type) {
		case "conflict":
			return new ProjectGitConflictError(error.conflicts);
		case "content":
			return new ProjectGitContentError(error.message);
		case "network":
			return new ProjectGitNetworkError(error.message);
		case "remote":
			return new ProjectGitRemoteError(error.message);
		case "rejected":
			return new ProjectGitRejectedError(error.message);
		case "transport":
			return new ProjectGitTransportError(error.message);
		case "failed":
			return new Error(error.message);
	}
}
