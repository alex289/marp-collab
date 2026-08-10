import fs from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import diff3Merge from "diff3";
import git, { type WalkerEntry } from "isomorphic-git";
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
	type: "add-add" | "binary" | "remote-deleted";
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

const LINEBREAKS = /^.*(?:\r?\n|$)/gm;

export function mergeTextFiles(base: string, project: string, remote: string): string {
	const result = diff3Merge(
		project.match(LINEBREAKS) ?? [],
		base.match(LINEBREAKS) ?? [],
		remote.match(LINEBREAKS) ?? [],
	);
	let merged = "";

	for (const block of result) {
		if (block.ok) {
			merged += block.ok.join("");
		} else if (block.conflict) {
			const projectText = block.conflict.a.join("");
			const remoteText = block.conflict.b.join("");
			merged += projectText;
			if (projectText && remoteText && !projectText.endsWith("\n")) {
				merged += "\n";
			}
			merged += remoteText;
		}
	}

	return merged;
}

function projectPath(dir: string, filepath: string): string {
	const root = resolve(dir);
	const path = resolve(root, filepath);
	if (!path.startsWith(`${root}${sep}`)) {
		throw new Error(`Invalid Git path: ${filepath}`);
	}
	return path;
}

async function keepVersion(dir: string, ref: string, filepath: string): Promise<void> {
	const { blob } = await git.readBlob({ fs, dir, oid: ref, filepath });
	const path = projectPath(dir, filepath);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, blob);
	await git.add({ fs, dir, filepath });
}

async function deleteVersion(dir: string, filepath: string): Promise<void> {
	await rm(projectPath(dir, filepath), { force: true });
	await git.remove({ fs, dir, filepath });
}

async function applyResolution(
	dir: string,
	filepath: string,
	resolution: ProjectGitResolution,
	ourOid: string,
	theirOid: string,
): Promise<void> {
	await keepVersion(dir, resolution === "project" ? ourOid : theirOid, filepath);
}

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
}): Promise<{ alreadyMerged: boolean }> {
	const { conflicts, ourOid, theirOid } = await findConflicts(dir, ours, theirs);
	const unresolved = conflicts.filter((conflict) => !resolutions[conflict.path]);
	if (unresolved.length > 0) {
		throw new ProjectGitConflictError(unresolved);
	}

	try {
		const merge = await git.merge({
			fs,
			dir,
			ours,
			theirs,
			author,
			abortOnConflict: false,
			allowUnrelatedHistories: true,
			mergeDriver: ({ contents, path }) => ({
				cleanMerge: isEditableExtension(path),
				mergedText: isEditableExtension(path)
					? mergeTextFiles(contents[0] ?? "", contents[1] ?? "", contents[2] ?? "")
					: (contents[1] ?? ""),
			}),
		});

		await git.checkout({ fs, dir, ref: ours, force: true });
		const addAdd = conflicts.filter((conflict) => conflict.type === "add-add");
		for (const conflict of addAdd) {
			await applyResolution(dir, conflict.path, resolutions[conflict.path]!, ourOid, theirOid);
		}
		if (addAdd.length > 0) {
			await git.commit({ fs, dir, ref: ours, message: "Resolve Git pull conflicts", author });
		}

		return { alreadyMerged: Boolean(merge.alreadyMerged) };
	} catch (error) {
		if (!(error instanceof git.Errors.MergeConflictError)) {
			throw error;
		}

		try {
			const resolved = new Set<string>();
			for (const filepath of error.data.bothModified) {
				const resolution = resolutions[filepath];
				if (!resolution) {
					throw new ProjectGitConflictError([{ path: filepath, type: "binary" }]);
				}
				await applyResolution(dir, filepath, resolution, ourOid, theirOid);
				resolved.add(filepath);
			}
			for (const filepath of error.data.deleteByUs) {
				await deleteVersion(dir, filepath);
				resolved.add(filepath);
			}
			for (const filepath of error.data.deleteByTheirs) {
				const resolution = resolutions[filepath];
				if (!resolution) {
					throw new ProjectGitConflictError([{ path: filepath, type: "remote-deleted" }]);
				}
				if (resolution === "project") {
					await keepVersion(dir, ourOid, filepath);
				} else {
					await deleteVersion(dir, filepath);
				}
				resolved.add(filepath);
			}
			for (const conflict of conflicts) {
				if (conflict.type === "add-add" && !resolved.has(conflict.path)) {
					await applyResolution(dir, conflict.path, resolutions[conflict.path]!, ourOid, theirOid);
				}
			}

			await git.commit({
				fs,
				dir,
				ref: ours,
				message: `Merge ${theirs} into ${ours}`,
				parent: [ourOid, theirOid],
				author,
			});
			await git.checkout({ fs, dir, ref: ours, force: true });
			return { alreadyMerged: false };
		} catch (resolutionError) {
			await git.abortMerge({ fs, dir, commit: ourOid }).catch(() => undefined);
			throw resolutionError;
		}
	}
}
