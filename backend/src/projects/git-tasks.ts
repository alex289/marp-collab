import fs from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import git from "isomorphic-git";
import { ProjectGitContentError, syncSupportedFiles } from "./git-files.ts";
import { projectGitHttp as http, ProjectGitNetworkError } from "./git-http.ts";
import { MAX_GIT_OBJECT_BYTES, MAX_GIT_PACK_UNPACKED_BYTES } from "./git-pack-limits.ts";
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
/**
 * Checking out a tree writes each path, so a blob listed under many paths is written many times.
 * Tests lower these.
 */
export const GIT_TREE_LIMITS = { entries: 50_000, bytes: MAX_GIT_PACK_UNPACKED_BYTES };
// Common file system limits; longer names would also reach logs and responses in error messages.
const MAX_GIT_NAME_BYTES = 255;
const MAX_GIT_PATH_BYTES = 4096;
const MAX_ERROR_MESSAGE_LENGTH = 1000;
const MAX_REPORTED_CONFLICTS = 200;

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

async function assertNoSymlinks(dir: string): Promise<void> {
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
}

/** Sizes of blobs already read, by object id; reading a blob is the only way to learn its size. */
type BlobSizes = Map<string, number>;

/**
 * Rejects trees that would not fit on disk once checked out, counting every path a blob appears
 * at, and paths too long to check out.
 */
async function assertTreeWithinLimits(dir: string, ref: string, sizes: BlobSizes): Promise<void> {
	let entries = 0;
	let total = 0;
	await git.walk({
		fs,
		dir,
		trees: [git.TREE({ ref })],
		map: async (filepath, [entry]) => {
			if (!entry || filepath === ".") {
				return;
			}
			const name = filepath.slice(filepath.lastIndexOf("/") + 1);
			if (
				Buffer.byteLength(name) > MAX_GIT_NAME_BYTES ||
				Buffer.byteLength(filepath) > MAX_GIT_PATH_BYTES
			) {
				throw new ProjectGitContentError("Git repository contains a path that is too long");
			}
			// Folders count too: checking them out creates them even when they are empty.
			entries++;
			if (entries > GIT_TREE_LIMITS.entries) {
				throw new ProjectGitContentError(
					`Git sync supports at most ${GIT_TREE_LIMITS.entries} files and folders per repository`,
				);
			}
			const type = await entry.type();
			if (type === "commit") {
				throw new ProjectGitContentError(`Git submodules are not supported: ${filepath}`);
			}
			if (type !== "blob") {
				return;
			}
			if ((await entry.mode()) === 0o120000) {
				throw new ProjectGitContentError(`Symbolic links are not supported: ${filepath}`);
			}
			const oid = await entry.oid();
			let size = sizes.get(oid);
			if (size === undefined) {
				size = (await git.readBlob({ fs, dir, oid })).blob.byteLength;
				sizes.set(oid, size);
			}
			if (size > MAX_GIT_OBJECT_BYTES) {
				throw new ProjectGitContentError(`File exceeds the size limit: ${filepath}`);
			}
			total += size;
			if (total > GIT_TREE_LIMITS.bytes) {
				throw new ProjectGitContentError("Git repository exceeds the size limit");
			}
		},
		// One entry at a time, so only one blob is in memory and the totals stay consistent.
		iterate: async (walk, children) => {
			const results = [];
			for (const child of children) {
				results.push(await walk(child));
			}
			return results;
		},
	});
}

async function stageProjectFiles(dir: string): Promise<boolean> {
	await assertNoSymlinks(dir);

	// Include ignored files: the remote's .gitignore must not keep project files out of commits.
	const matrix = await git.statusMatrix({ fs, dir, ignored: true });
	let changed = false;

	for (const [filepath, head, worktree] of matrix) {
		// Listing ignored files also lists the repository's own .git folder.
		if (head === worktree || filepath.split("/").includes(".git")) {
			continue;
		}

		if (worktree) {
			await git.add({ fs, dir, filepath, force: true });
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
	// A stopped checkout leaves files the index does not know about, which the next sync would
	// commit, so rebuild the working tree and index from scratch.
	for (const name of await readdir(dir)) {
		if (name !== ".git") {
			await rm(join(dir, name), { recursive: true, force: true });
		}
	}
	await rm(join(dir, ".git", "index"), { force: true });
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
		const sizes: BlobSizes = new Map();
		await assertTreeWithinLimits(dir, remoteRef, sizes);

		const commit = await git.resolveRef({ fs, dir, ref });
		let checkingOut = false;
		try {
			// The merge only writes Git objects, so its result can be checked before checking it out.
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
				await assertTreeWithinLimits(dir, ref, sizes);
				checkingOut = true;
				await git.checkout({ fs, dir, ref, force: true });
			}
		} catch (error) {
			if (checkingOut) {
				await resetBranch({ ...remote, commit });
			} else {
				await git.writeRef({ fs, dir, ref, value: commit, force: true });
			}
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

/** Messages can quote paths from the remote, which may be very long. */
function shorten(message: string): string {
	return message.length > MAX_ERROR_MESSAGE_LENGTH
		? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
		: message;
}

/** Error classes do not survive the process boundary, so errors travel as plain data. */
export function serializeGitError(error: unknown): SerializedGitError {
	if (error instanceof ProjectGitConflictError) {
		// Resolving these and pulling again reports any further conflicts.
		return { type: "conflict", conflicts: error.conflicts.slice(0, MAX_REPORTED_CONFLICTS) };
	}
	if (error instanceof ProjectGitContentError) {
		return { type: "content", message: shorten(error.message) };
	}
	if (error instanceof ProjectGitNetworkError) {
		return { type: "network", message: shorten(error.message) };
	}
	if (error instanceof ProjectGitRemoteError) {
		return { type: "remote", message: shorten(error.message) };
	}
	if (error instanceof git.Errors.UnsafeFilepathError) {
		return { type: "content", message: "Git repository contains an unsafe path" };
	}
	if (error instanceof git.Errors.ObjectTypeError) {
		return { type: "content", message: "Git repository contains an invalid object" };
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
		message: shorten(error instanceof Error ? `${error.name}: ${error.message}` : String(error)),
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
