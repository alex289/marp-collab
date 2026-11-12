import fs from "node:fs";
import { diff3Merge } from "node-diff3";
import git, { type TreeEntry as GitTreeEntry, type WalkerEntry } from "isomorphic-git";
import { isEditableExtension } from "../helpers/file-allowlist.ts";

type GitAuthor = {
	name: string;
	email: string;
};

type TreeEntry = {
	mode: number;
	oid: string;
	type: string;
};

export type ProjectGitConflict = {
	path: string;
	type: "add-add" | "binary" | "project-deleted" | "remote-deleted";
};

export type ProjectGitResolution = "project" | "remote";

export class ProjectGitConflictError extends Error {
	readonly conflicts: ProjectGitConflict[];

	constructor(conflicts: ProjectGitConflict[]) {
		super("Git pull needs conflict resolution");
		this.conflicts = conflicts;
	}
}

async function entryData(entry?: WalkerEntry | null): Promise<TreeEntry | null> {
	if (!entry) {
		return null;
	}

	return {
		mode: await entry.mode(),
		oid: await entry.oid(),
		type: await entry.type(),
	};
}

function entriesEqual(left: TreeEntry | null, right: TreeEntry | null): boolean {
	return left?.mode === right?.mode && left?.oid === right?.oid && left?.type === right?.type;
}

async function findConflicts(dir: string, ours: string, theirs: string) {
	const [ourOid, theirOid] = await Promise.all([
		git.resolveRef({ fs, dir, ref: ours }),
		git.resolveRef({ fs, dir, ref: theirs }),
	]);
	const mergeBases = await git.findMergeBase({ fs, dir, oids: [ourOid, theirOid] });
	const baseOid = mergeBases[0] ?? (await git.writeTree({ fs, dir, tree: [] }));
	const conflicts: ProjectGitConflict[] = [];

	await git.walk({
		fs,
		dir,
		trees: [git.TREE({ ref: baseOid }), git.TREE({ ref: ourOid }), git.TREE({ ref: theirOid })],
		map: async (path, [baseEntry, ourEntry, theirEntry]) => {
			const [base, project, remote] = await Promise.all([
				entryData(baseEntry),
				entryData(ourEntry),
				entryData(theirEntry),
			]);

			if (
				path === "." ||
				entriesEqual(project, remote) ||
				entriesEqual(project, base) ||
				entriesEqual(remote, base)
			) {
				return;
			}

			if (!base && project?.type === "blob" && remote?.type === "blob") {
				conflicts.push({ path, type: "add-add" });
			} else if (base?.type === "blob" && project?.type === "blob" && !remote) {
				conflicts.push({ path, type: "remote-deleted" });
			} else if (base?.type === "blob" && !project && remote?.type === "blob") {
				conflicts.push({ path, type: "project-deleted" });
			} else if (
				project?.type === "blob" &&
				remote?.type === "blob" &&
				!isEditableExtension(path)
			) {
				conflicts.push({ path, type: "binary" });
			}
		},
	});

	return { conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)), ourOid, theirOid };
}

const LINEBREAKS = /^.*(?:\n|$)/gm;

function usesCrlf(text: string): boolean {
	return text.includes("\r\n");
}

/**
 * Three-way merge of text files. Where both sides changed the same lines, both versions are kept
 * (project first) and `overlapping` is set so the user can be told to review the file.
 */
export function mergeTextFiles(
	base: string,
	project: string,
	remote: string,
): { text: string; overlapping: boolean } {
	// Compare lines without their endings, so a line-ending change alone does not conflict.
	const [baseLines, projectLines, remoteLines] = [base, project, remote].map(
		(text) => text.replaceAll("\r\n", "\n").match(LINEBREAKS) ?? [],
	);
	const result = diff3Merge<string>(projectLines!, baseLines!, remoteLines!);
	let merged = "";
	let overlapping = false;

	for (const block of result) {
		if (block.ok) {
			merged += block.ok.join("");
		} else if (block.conflict) {
			overlapping = true;
			const projectText = block.conflict.a.join("");
			const remoteText = block.conflict.b.join("");
			merged += projectText;
			if (projectText && remoteText && !projectText.endsWith("\n")) {
				merged += "\n";
			}
			merged += remoteText;
		}
	}

	// Keep the project's line endings unless the remote switched them.
	const crlf = usesCrlf(remote) !== usesCrlf(base) ? usesCrlf(remote) : usesCrlf(project);
	return { text: crlf ? merged.replaceAll("\n", "\r\n") : merged, overlapping };
}

const RESOLVED_REF = "refs/marp-collab/resolved";

/** The entry at `path` in a tree, or null where nothing is. */
async function findEntry(dir: string, tree: string, path: string[]): Promise<GitTreeEntry | null> {
	const [name, ...rest] = path;
	const { tree: entries } = await git.readTree({ fs, dir, oid: tree });
	const entry = entries.find((candidate) => candidate.path === name);
	if (!entry || rest.length === 0) {
		return entry ?? null;
	}
	return entry.type === "tree" ? findEntry(dir, entry.oid, rest) : null;
}

/** Writes a copy of `tree` with `entry` at `path`, or without anything there. Returns null for an empty tree. */
async function replaceEntry(
	dir: string,
	tree: string | null,
	path: string[],
	entry: GitTreeEntry | null,
): Promise<string | null> {
	const [name, ...rest] = path;
	const entries = tree ? (await git.readTree({ fs, dir, oid: tree })).tree : [];
	let replacement: GitTreeEntry | null = entry && { ...entry, path: name! };
	if (rest.length > 0) {
		const current = entries.find((candidate) => candidate.path === name);
		const subtree = await replaceEntry(
			dir,
			current?.type === "tree" ? current.oid : null,
			rest,
			entry,
		);
		replacement = subtree ? { mode: "040000", path: name!, oid: subtree, type: "tree" } : null;
	}
	const result = entries.filter((candidate) => candidate.path !== name);
	if (replacement) {
		result.push(replacement);
	}
	return result.length > 0 ? git.writeTree({ fs, dir, tree: result }) : null;
}

/**
 * Commits on top of `commit` the versions `source` has at `paths`, without touching the working
 * tree. Merging afterwards then finds nothing to resolve at those paths.
 */
async function takeVersions(
	dir: string,
	commit: string,
	source: string,
	paths: string[],
	author: GitAuthor,
	ref?: string,
): Promise<string> {
	const [{ commit: target }, { commit: from }] = await Promise.all([
		git.readCommit({ fs, dir, oid: commit }),
		git.readCommit({ fs, dir, oid: source }),
	]);
	let tree: string = target.tree;
	for (const path of paths) {
		const parts = path.split("/");
		tree =
			(await replaceEntry(dir, tree, parts, await findEntry(dir, from.tree, parts))) ??
			(await git.writeTree({ fs, dir, tree: [] }));
	}
	return git.commit({
		fs,
		dir,
		message: "Resolve Git pull conflicts",
		author,
		tree,
		parent: [commit],
		...(ref ? { ref } : { noUpdateBranch: true }),
	});
}

/**
 * Merges `theirs` into `ours` without touching the working tree or index, so the caller can check
 * the result before checking it out. Conflicts need a resolution in `resolutions`.
 */
export async function mergeProjectBranches({
	dir,
	ours,
	theirs,
	author,
	resolutions = {},
}: {
	dir: string;
	ours: string;
	theirs: string;
	author: GitAuthor;
	resolutions?: Record<string, ProjectGitResolution>;
}): Promise<{ alreadyMerged: boolean; overlapping: string[] }> {
	const { conflicts, ourOid, theirOid } = await findConflicts(dir, ours, theirs);
	const unresolved = conflicts.filter((conflict) => !resolutions[conflict.path]);
	if (unresolved.length > 0) {
		throw new ProjectGitConflictError(unresolved);
	}

	// Give each conflicting path its chosen version on the other side too, so the merge is clean.
	const resolvedAs = (resolution: ProjectGitResolution) =>
		conflicts
			.filter((conflict) => resolutions[conflict.path] === resolution)
			.map(({ path }) => path);
	const remotePaths = resolvedAs("remote");
	const projectPaths = resolvedAs("project");
	if (remotePaths.length > 0) {
		await takeVersions(dir, ourOid, theirOid, remotePaths, author, ours);
	}
	const resolvedTheirs =
		projectPaths.length > 0
			? await takeVersions(dir, theirOid, ourOid, projectPaths, author)
			: theirOid;

	const overlapping = new Set<string>();
	await git.writeRef({ fs, dir, ref: RESOLVED_REF, value: resolvedTheirs, force: true });
	try {
		const merge = await git.merge({
			fs,
			dir,
			ours,
			theirs: RESOLVED_REF,
			author,
			message: `Merge ${theirs} into ${ours}`,
			abortOnConflict: true,
			allowUnrelatedHistories: true,
			mergeDriver: ({ contents, path }) => {
				if (!isEditableExtension(path)) {
					return { cleanMerge: false, mergedText: contents[1] ?? "" };
				}
				const merged = mergeTextFiles(contents[0] ?? "", contents[1] ?? "", contents[2] ?? "");
				if (merged.overlapping) {
					overlapping.add(path);
				}
				return { cleanMerge: true, mergedText: merged.text };
			},
		});
		return { alreadyMerged: Boolean(merge.alreadyMerged), overlapping: [...overlapping].sort() };
	} finally {
		await git.deleteRef({ fs, dir, ref: RESOLVED_REF });
	}
}
