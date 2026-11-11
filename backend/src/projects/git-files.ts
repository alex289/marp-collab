import { copyFile, mkdir, readdir, rm, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getFileType } from "../helpers/file-allowlist.ts";

/** Hidden files, Git metadata, collaboration state and unsupported types stay private. */
async function supportedFiles(dir: string, prefix = ""): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
		if (entry.name.startsWith(".")) {
			continue;
		}
		const path = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) {
			throw new Error("Symbolic links are not supported");
		}
		if (entry.isDirectory()) {
			files.push(...(await supportedFiles(dir, path)));
		} else if (entry.isFile() && getFileType(path)) {
			files.push(path);
		}
	}
	return files;
}

async function removeEmptyDirectories(dir: string): Promise<void> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) {
			continue;
		}
		const path = join(dir, entry.name);
		await removeEmptyDirectories(path);
		try {
			await rmdir(path);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOTEMPTY")) {
				throw error;
			}
		}
	}
}

/** Replace only supported files, retaining unrelated repository contents. */
export async function syncSupportedFiles(source: string, destination: string): Promise<void> {
	await mkdir(source, { recursive: true });
	await mkdir(destination, { recursive: true });
	const files = new Set(await supportedFiles(source));
	for (const path of await supportedFiles(destination)) {
		if (!files.has(path)) {
			await rm(join(destination, path));
		}
	}
	await removeEmptyDirectories(destination);
	for (const path of files) {
		await mkdir(dirname(join(destination, path)), { recursive: true });
		await copyFile(join(source, path), join(destination, path));
	}
}
