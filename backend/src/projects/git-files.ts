import { copyFile, mkdir, readdir, rm, rmdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getFileType } from "../helpers/file-allowlist.ts";
import {
	MAX_IMPORT_ENTRY_COUNT,
	MAX_IMPORT_FILE_UNCOMPRESSED_BYTES,
	MAX_IMPORT_TOTAL_UNCOMPRESSED_BYTES,
} from "./project-import.ts";

export class ProjectGitContentError extends Error {}

/** Hidden files, Git metadata, collaboration state and unsupported types stay private. */
async function supportedFiles(dir: string, prefix = ""): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
		if (entry.name.startsWith(".")) {
			continue;
		}
		const path = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) {
			throw new ProjectGitContentError(`Symbolic links are not supported: ${path}`);
		}
		if (entry.isDirectory()) {
			files.push(...(await supportedFiles(dir, path)));
		} else if (entry.isFile() && getFileType(path)) {
			files.push(path);
		}
	}
	return files;
}

/** Apply the project import limits, so a Git sync cannot fill the disk either. */
async function assertWithinLimits(dir: string, files: string[]): Promise<void> {
	if (files.length > MAX_IMPORT_ENTRY_COUNT) {
		throw new ProjectGitContentError(
			`Git sync supports at most ${MAX_IMPORT_ENTRY_COUNT} files per project`,
		);
	}
	let total = 0;
	for (const path of files) {
		const { size } = await stat(join(dir, path));
		if (size > MAX_IMPORT_FILE_UNCOMPRESSED_BYTES) {
			throw new ProjectGitContentError(`File exceeds the size limit: ${path}`);
		}
		total += size;
		if (total > MAX_IMPORT_TOTAL_UNCOMPRESSED_BYTES) {
			throw new ProjectGitContentError("Project files exceed the total size limit");
		}
	}
}

/** Remove folders emptied by deleting `path`, but keep empty folders users created. */
async function removeEmptiedParents(root: string, path: string): Promise<void> {
	for (let parent = dirname(path); parent !== "."; parent = dirname(parent)) {
		try {
			await rmdir(join(root, parent));
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOTEMPTY") {
				return;
			}
			throw error;
		}
	}
}

/**
 * Replace only supported files, retaining unrelated repository contents. Pass `companionSuffix`
 * when the destination is the project, so a removed file's collaboration state goes with it.
 */
export async function syncSupportedFiles(
	source: string,
	destination: string,
	{ companionSuffix }: { companionSuffix?: string } = {},
): Promise<void> {
	await mkdir(source, { recursive: true });
	await mkdir(destination, { recursive: true });
	const sourceFiles = await supportedFiles(source);
	await assertWithinLimits(source, sourceFiles);
	const files = new Set(sourceFiles);
	for (const path of await supportedFiles(destination)) {
		if (!files.has(path)) {
			await rm(join(destination, path));
			if (companionSuffix) {
				await rm(join(destination, `${path}${companionSuffix}`), { force: true });
			}
			await removeEmptiedParents(destination, path);
		}
	}
	for (const path of files) {
		await mkdir(dirname(join(destination, path)), { recursive: true });
		await copyFile(join(source, path), join(destination, path));
	}
}
