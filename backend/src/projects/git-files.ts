import { copyFile, lstat, mkdir, readdir, rm, rmdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getFileType, isEditableExtension } from "../helpers/file-allowlist.ts";
import {
	MAX_IMPORT_ENTRY_COUNT,
	MAX_IMPORT_FILE_UNCOMPRESSED_BYTES,
	MAX_IMPORT_TOTAL_UNCOMPRESSED_BYTES,
} from "./project-import.ts";

export class ProjectGitContentError extends Error {}

/** Pulled documents are loaded into memory to update their collaboration state. */
export const MAX_GIT_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_GIT_DOCUMENTS_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB
const STATE_SUFFIX = ".yjs";

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
async function assertWithinLimits(
	dir: string,
	files: string[],
	intoProject: boolean,
): Promise<void> {
	if (files.length > MAX_IMPORT_ENTRY_COUNT) {
		throw new ProjectGitContentError(
			`Git sync supports at most ${MAX_IMPORT_ENTRY_COUNT} files per project`,
		);
	}
	const folders = new Set<string>();
	for (const path of files) {
		for (let folder = dirname(path); folder !== "."; folder = dirname(folder)) {
			folders.add(folder);
		}
	}
	let total = 0;
	let documentsTotal = 0;
	for (const path of files) {
		const { size } = await stat(join(dir, path));
		if (size > MAX_IMPORT_FILE_UNCOMPRESSED_BYTES) {
			throw new ProjectGitContentError(`File exceeds the size limit: ${path}`);
		}
		total += size;
		if (total > MAX_IMPORT_TOTAL_UNCOMPRESSED_BYTES) {
			throw new ProjectGitContentError("Project files exceed the total size limit");
		}
		if (intoProject && isEditableExtension(path)) {
			if (size > MAX_GIT_DOCUMENT_BYTES) {
				throw new ProjectGitContentError(`Document exceeds the size limit: ${path}`);
			}
			documentsTotal += size;
			if (documentsTotal > MAX_GIT_DOCUMENTS_TOTAL_BYTES) {
				throw new ProjectGitContentError("Documents exceed the total size limit");
			}
			if (folders.has(`${path}${STATE_SUFFIX}`)) {
				throw new ProjectGitContentError(
					`A folder takes the place of collaboration state: ${path}${STATE_SUFFIX}`,
				);
			}
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

/** Remove `path` if it is a file; a folder of the same name is the user's to keep. */
async function removeFile(path: string): Promise<void> {
	const stats = await lstat(path).catch(() => null);
	if (stats?.isFile()) {
		await rm(path);
	}
}

/**
 * Replace only supported files, retaining unrelated repository contents. Pass `intoProject` when
 * the destination is the project, so pulled documents stay within what collaboration can load and
 * a removed file's collaboration state goes with it.
 */
export async function syncSupportedFiles(
	source: string,
	destination: string,
	{ intoProject = false }: { intoProject?: boolean } = {},
): Promise<void> {
	await mkdir(source, { recursive: true });
	await mkdir(destination, { recursive: true });
	const sourceFiles = await supportedFiles(source);
	await assertWithinLimits(source, sourceFiles, intoProject);
	const files = new Set(sourceFiles);
	for (const path of await supportedFiles(destination)) {
		if (!files.has(path)) {
			await rm(join(destination, path));
			if (intoProject) {
				await removeFile(join(destination, `${path}${STATE_SUFFIX}`));
			}
			await removeEmptiedParents(destination, path);
		}
	}
	for (const path of files) {
		await mkdir(dirname(join(destination, path)), { recursive: true });
		await copyFile(join(source, path), join(destination, path));
	}
}
