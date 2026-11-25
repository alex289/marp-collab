import {
	glob,
	lstat,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	rmdir,
	stat,
	writeFile,
} from "node:fs/promises";
import { createReadStream, type Stats } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { getFileType, MARKDOWN_EXTENSIONS } from "../helpers/file-allowlist.ts";
import { parseProjectDocumentName } from "../../../shared/collaboration.ts";
import { DOCUMENT_STATE_SUFFIX, documentStatePath } from "./document-state-path.ts";

export type DeckFile = {
	id: string;
	label: string;
	type: "markdown" | "asset" | "folder";
};

const dataDir = resolve(process.cwd(), process.env.DATA_PATH ?? "data");
const presentationsDir = resolve(dataDir, "presentations");

const projectIdRegex = new RegExp("^[a-zA-Z0-9-]+$");
function isValidProjectId(projectId: string): boolean {
	return projectIdRegex.test(projectId);
}

function isProjectRelativePath(path: string): boolean {
	return (
		path.length > 0 &&
		!isAbsolute(path) &&
		!path
			.replace(/\\/g, "/")
			.split("/")
			.some((part) => part.startsWith("."))
	);
}

function resolveContainedPath(projectId: string, path: string): string | null {
	const resolved = resolve(presentationsDir, projectId, path);
	return resolved.startsWith(presentationsDir + sep) ? resolved : null;
}

function resolveProjectFilePath(projectId: string, fileId: string): string | null {
	return isValidProjectId(projectId) && isProjectRelativePath(fileId)
		? resolveContainedPath(projectId, fileId)
		: null;
}

function resolveDocumentPath(documentName: string): string | null {
	const identity = parseProjectDocumentName(documentName);
	if (!identity) {
		return null;
	}

	const { projectId, fileId } = identity;
	if (!isValidProjectId(projectId) || !fileId) {
		return null;
	}

	if (!isProjectRelativePath(fileId)) {
		throw new Error(`Invalid presentation file id: ${fileId}`);
	}

	const filePath = resolveContainedPath(projectId, fileId);
	if (!filePath) {
		throw new Error(`Path traversal detected: ${fileId}`);
	}

	return filePath;
}

function isMissingFileError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function getProjectDirectoryPath(projectId: string): string {
	if (!isValidProjectId(projectId)) {
		throw new Error(`Invalid project id: ${projectId}`);
	}
	return resolve(presentationsDir, projectId);
}

export async function getProjectDirectory(projectId: string): Promise<string> {
	const dir = getProjectDirectoryPath(projectId);
	await mkdir(dir, { recursive: true });
	return dir;
}

export async function clearProjectDocumentState(projectId: string): Promise<void> {
	const projectDir = await getProjectDirectory(projectId);
	const files = await Array.fromAsync(
		glob(`**/*${DOCUMENT_STATE_SUFFIX}`, { cwd: projectDir, exclude: [".git/**"] }),
	);
	await Promise.all(files.map((file) => rm(resolve(projectDir, file))));
}

export async function getDeckFiles(projectId: string): Promise<DeckFile[]> {
	const projectDir = await getProjectDirectory(projectId);
	const entries = await Array.fromAsync(
		glob("**/*", {
			cwd: projectDir,
			withFileTypes: true,
			exclude: (dirent) => dirent.name.startsWith("."),
		}),
	);

	return entries
		.filter(
			(dirent) =>
				dirent.isDirectory() || extname(dirent.name).toLowerCase() !== DOCUMENT_STATE_SUFFIX,
		)
		.map((dirent) => {
			const id = relative(projectDir, join(dirent.parentPath, dirent.name)).replace(/\\/g, "/");
			if (dirent.isDirectory()) {
				return { id, label: id, type: "folder" as const };
			}
			return { id, label: id, type: getFileType(id) ?? ("asset" as const) };
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

type ZipSourceEntry = {
	path: string;
	type: "directory" | "file";
	fullPath: string | null;
};

export async function createProjectZipStream(projectId: string): Promise<Readable> {
	const projectDir = await getProjectDirectory(projectId);
	const zipEntries: ZipSourceEntry[] = [];

	async function collectEntries(relativeDir: string): Promise<void> {
		const currentDir = resolve(projectDir, relativeDir);
		const entries = await readdir(currentDir, { withFileTypes: true });

		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.name.startsWith(".")) {
				continue;
			}

			const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			const fullPath = resolve(projectDir, relativePath);
			if (!fullPath.startsWith(projectDir + sep)) {
				throw new Error(`Path traversal detected while exporting: ${relativePath}`);
			}

			if (entry.isDirectory()) {
				zipEntries.push({ path: relativePath, type: "directory", fullPath: null });
				await collectEntries(relativePath);
				continue;
			}

			if (!entry.isFile() || extname(entry.name).toLowerCase() === DOCUMENT_STATE_SUFFIX) {
				continue;
			}

			zipEntries.push({ path: relativePath, type: "file", fullPath });
		}
	}

	await collectEntries("");

	const archive = new ZipArchive({ zlib: { level: 9 } });

	for (const entry of zipEntries) {
		if (entry.type === "directory") {
			archive.append("", { name: `${entry.path}/`, type: "directory" });
			continue;
		}

		if (entry.fullPath) {
			archive.file(entry.fullPath, { name: entry.path });
		}
	}

	await archive.finalize();
	return archive;
}

export async function createProjectDir(projectId: string, dirPath: string): Promise<void> {
	if (!isValidProjectId(projectId)) {
		throw new Error(`Invalid project id: ${projectId}`);
	}

	if (!isProjectRelativePath(dirPath)) {
		throw new Error(`Invalid dir path: ${dirPath}`);
	}

	const dir = resolveContainedPath(projectId, dirPath);
	if (!dir) {
		throw new Error(`Path traversal detected: ${dirPath}`);
	}

	await mkdir(dir, { recursive: true });
}

export async function getDocumentContent(documentName: string): Promise<string | undefined> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return undefined;
	}

	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		// A directory (or a path below a regular file) is not a document.
		if (
			isMissingFileError(error) ||
			(error instanceof Error &&
				"code" in error &&
				(error.code === "EISDIR" || error.code === "ENOTDIR"))
		) {
			return undefined;
		}

		throw error;
	}
}

export async function getDocumentBinary(documentName: string): Promise<Uint8Array | undefined> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return undefined;
	}

	try {
		const buf = await readFile(documentStatePath(filePath));
		return new Uint8Array(buf);
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}

		throw error;
	}
}

export async function documentFileExists(documentName: string): Promise<boolean> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return false;
	}

	return (await getFileStatsSafe(filePath))?.isFile() ?? false;
}

export async function saveDocumentContent(documentName: string, content: string): Promise<void> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return;
	}

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
}

/** Create without ever overwriting a presentation another client just created. */
export async function createDocumentContent(documentName: string, content: string): Promise<void> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		throw new Error("Invalid document name");
	}
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
}

export async function saveDocumentBinary(documentName: string, data: Uint8Array): Promise<void> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return;
	}

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(documentStatePath(filePath), data);
}

export function isValidProjectFileLocation(projectId: string, fileId: string): boolean {
	return resolveProjectFilePath(projectId, fileId) !== null;
}

export async function getProjectFileSize(
	projectId: string,
	fileId: string,
): Promise<number | undefined> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	const info = filePath ? await getFileStatsSafe(filePath) : undefined;
	return info?.isFile() ? info.size : undefined;
}

export async function readProjectFile(
	projectId: string,
	fileId: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return undefined;
	}

	try {
		return new Uint8Array(await readFile(filePath));
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}

		throw error;
	}
}

export type OpenedProjectFile = {
	stream: Readable;
	size: number;
	mtimeMs: number;
};

export async function openProjectFile(
	projectId: string,
	fileId: string,
): Promise<OpenedProjectFile | undefined> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return undefined;
	}

	let fileStat: Stats;
	try {
		fileStat = await stat(filePath);
	} catch {
		return undefined;
	}

	return {
		stream: createReadStream(filePath),
		size: fileStat.size,
		mtimeMs: fileStat.mtimeMs,
	};
}

function isValidProjectBasename(name: string): boolean {
	const trimmed = name.trim();
	return (
		trimmed.length > 0 &&
		trimmed.length <= 255 &&
		trimmed === name &&
		!trimmed.includes("/") &&
		!trimmed.includes("\\") &&
		!trimmed.includes("..") &&
		/^[\w\-. ]+$/.test(trimmed)
	);
}

function getParentFolder(fileId: string): string {
	const normalized = fileId.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	const lastSlash = normalized.lastIndexOf("/");
	return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
}

function getRenamedSiblingId(fileId: string, name: string): string | null {
	if (!isValidProjectBasename(name)) {
		return null;
	}

	const parentFolder = getParentFolder(fileId);
	return parentFolder ? `${parentFolder}/${name}` : name;
}

async function getFileStatsSafe(path: string): Promise<Stats | undefined> {
	try {
		return await lstat(path);
	} catch {
		return undefined;
	}
}

async function isRenamePossible(
	sourcePath: string,
	destPath: string,
	expectedType: "file" | "dir",
): Promise<boolean> {
	const [sourceStat, destStat] = await Promise.all([
		getFileStatsSafe(sourcePath),
		getFileStatsSafe(destPath),
	]);
	if (!sourceStat) {
		return false;
	}
	if (expectedType === "file" && !sourceStat.isFile()) {
		return false;
	}
	if (expectedType === "dir" && !sourceStat.isDirectory()) {
		return false;
	}

	return (
		destStat === undefined || (destStat.dev === sourceStat.dev && destStat.ino === sourceStat.ino)
	);
}

export function isMarkdownFileId(fileId: string): boolean {
	return MARKDOWN_EXTENSIONS.has(extname(fileId).toLowerCase());
}

export async function saveProjectFile(
	projectId: string,
	fileId: string,
	data: Uint8Array,
	flag?: "wx",
): Promise<void> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		throw new Error(`Invalid project file path: ${fileId}`);
	}

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, data, { flag });
}

export async function relocateProjectEntry(
	projectId: string,
	sourceId: string,
	destinationId: string,
	kind: "file" | "dir",
): Promise<string | null> {
	const sourcePath = resolveProjectFilePath(projectId, sourceId);
	const destPath = resolveProjectFilePath(projectId, destinationId);
	if (!sourcePath || !destPath || destPath.startsWith(sourcePath + sep)) {
		return null;
	}

	if (!(await isRenamePossible(sourcePath, destPath, kind))) {
		return null;
	}
	if (sourcePath === destPath) {
		return destinationId;
	}

	const sourceState = documentStatePath(sourcePath);
	const destState = documentStatePath(destPath);
	const hasState = kind === "file" && (await getFileStatsSafe(sourceState)) !== undefined;
	if (kind === "file" && (await getFileStatsSafe(destState))) {
		if (!hasState || !(await isRenamePossible(sourceState, destState, "file"))) {
			return null;
		}
	}
	try {
		await rename(sourcePath, destPath);
	} catch (error) {
		if (
			isMissingFileError(error) ||
			(error instanceof Error && "code" in error && error.code === "ENOTDIR")
		) {
			return null;
		}
		throw error;
	}
	if (hasState) {
		try {
			await rename(sourceState, destState);
		} catch (error) {
			await rename(destPath, sourcePath);
			throw error;
		}
	}
	return destinationId;
}

export function moveProjectFile(
	projectId: string,
	fileId: string,
	destinationFolder: string,
): Promise<string | null> {
	const basename = fileId.split("/").at(-1)!;
	const destinationId = destinationFolder ? `${destinationFolder}/${basename}` : basename;
	return relocateProjectEntry(projectId, fileId, destinationId, "file");
}

export function renameProjectFile(
	projectId: string,
	fileId: string,
	name: string,
): Promise<string | null> {
	const id = getRenamedSiblingId(fileId, name);
	if (!id || !getFileType(name) || extname(name).toLowerCase() !== extname(fileId).toLowerCase()) {
		return Promise.resolve(null);
	}
	return relocateProjectEntry(projectId, fileId, id, "file");
}

export function renameProjectFolder(
	projectId: string,
	folderPath: string,
	name: string,
): Promise<string | null> {
	const id = getRenamedSiblingId(folderPath, name);
	return id ? relocateProjectEntry(projectId, folderPath, id, "dir") : Promise.resolve(null);
}

export async function deleteProjectFolder(
	projectId: string,
	folderPath: string,
	recursive = true,
): Promise<boolean> {
	const dirPath = resolveProjectFilePath(projectId, folderPath);
	if (!dirPath) {
		return false;
	}

	try {
		if (recursive) {
			if (!(await lstat(dirPath)).isDirectory()) {
				return false;
			}
			await rm(dirPath, { recursive: true });
		} else {
			await rmdir(dirPath);
		}
		return true;
	} catch (error) {
		if (
			isMissingFileError(error) ||
			(error instanceof Error && "code" in error && error.code === "ENOTDIR")
		) {
			return false;
		}
		throw error;
	}
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<boolean> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return false;
	}

	try {
		await rm(filePath);
	} catch (error) {
		if (isMissingFileError(error)) {
			return false;
		}
		throw error;
	}

	try {
		await rm(documentStatePath(filePath));
	} catch {
		// .yjs companion may not exist for files that were never collab-edited
	}

	return true;
}

export async function deleteProjectDirectory(projectId: string): Promise<void> {
	await rm(getProjectDirectoryPath(projectId), { recursive: true, force: true });
}

export async function commitStagedProjectDirectory(
	stagingId: string,
	projectId: string,
): Promise<void> {
	if (!isValidProjectId(stagingId) || !isValidProjectId(projectId)) {
		throw new Error("Invalid project id");
	}

	const sourceDir = resolve(presentationsDir, stagingId);
	const destDir = resolve(presentationsDir, projectId);
	if (
		!sourceDir.startsWith(presentationsDir + sep) ||
		!destDir.startsWith(presentationsDir + sep)
	) {
		throw new Error("Path traversal detected");
	}

	await rename(sourceDir, destDir);
}
