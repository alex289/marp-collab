import { glob, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { getFileType, MARKDOWN_EXTENSIONS } from "../helpers/file-allowlist.ts";
import { fileExists } from "../helpers/file-exists.ts";

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

function resolveDocumentPath(documentName: string): string | null {
	const parts = documentName.split("/");
	if (parts.length < 3 || parts[0] !== "project") {
		return null;
	}

	const projectId = parts[1];
	if (!projectId || !isValidProjectId(projectId)) {
		return null;
	}

	const fileId = parts.slice(2).join("/");
	if (!fileId) {
		return null;
	}

	if (isAbsolute(fileId) || fileId.split("/").includes("..")) {
		throw new Error(`Invalid presentation file id: ${fileId}`);
	}

	const filePath = resolve(presentationsDir, projectId, fileId);
	if (!filePath.startsWith(presentationsDir + sep)) {
		throw new Error(`Path traversal detected: ${fileId}`);
	}

	return filePath;
}

function isMissingFileError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

const EXCLUDED_FILE_EXTENSIONS = new Set([".yjs"]);

async function ensurePresentationsDir(projectId: string): Promise<void> {
	if (!isValidProjectId(projectId)) {
		throw new Error(`Invalid project id: ${projectId}`);
	}
	await mkdir(resolve(presentationsDir, projectId), { recursive: true });
}

export function toDocumentName(projectId: string, fileId: string): string {
	return `project/${projectId}/${fileId}`;
}

export async function getDeckFiles(projectId: string): Promise<DeckFile[]> {
	await ensurePresentationsDir(projectId);

	const projectDir = resolve(presentationsDir, projectId);
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
				dirent.isDirectory() || !EXCLUDED_FILE_EXTENSIONS.has(extname(dirent.name).toLowerCase()),
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
	await ensurePresentationsDir(projectId);

	const projectDir = resolve(presentationsDir, projectId);
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

			if (!entry.isFile() || EXCLUDED_FILE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
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

	if (!dirPath || isAbsolute(dirPath) || dirPath.split("/").includes("..")) {
		throw new Error(`Invalid dir path: ${dirPath}`);
	}

	const dir = resolve(presentationsDir, projectId, dirPath);
	if (!dir.startsWith(presentationsDir + sep)) {
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
		if (isMissingFileError(error)) {
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
		const buf = await readFile(`${filePath}.yjs`);
		return new Uint8Array(buf);
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}

		throw error;
	}
}

export async function saveDocumentContent(documentName: string, content: string): Promise<void> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return;
	}

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
}

export async function saveDocumentBinary(documentName: string, data: Uint8Array): Promise<void> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return;
	}

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(`${filePath}.yjs`, data);
}

export function resolveProjectFilePath(projectId: string, fileId: string): string | null {
	if (!isValidProjectId(projectId)) {
		return null;
	}

	if (!fileId || isAbsolute(fileId) || fileId.split("/").includes("..")) {
		return null;
	}

	const filePath = resolve(presentationsDir, projectId, fileId);
	if (!filePath.startsWith(presentationsDir + sep)) {
		return null;
	}

	return filePath;
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
		return await stat(path);
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
): Promise<void> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		throw new Error(`Invalid project file path: ${fileId}`);
	}

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, data);
}

export async function moveProjectFile(
	projectId: string,
	fileId: string,
	destinationFolder: string,
): Promise<string | null> {
	const sourcePath = resolveProjectFilePath(projectId, fileId);
	if (!sourcePath) {
		return null;
	}

	const basename = fileId.split("/").pop()!;
	const newFileId = destinationFolder ? `${destinationFolder}/${basename}` : basename;

	const destPath = resolveProjectFilePath(projectId, newFileId);
	if (!destPath) {
		return null;
	}

	await rename(sourcePath, destPath);

	try {
		await rename(`${sourcePath}.yjs`, `${destPath}.yjs`);
	} catch {
		// .yjs companion may not exist
	}

	return newFileId;
}

export async function renameProjectFile(
	projectId: string,
	fileId: string,
	name: string,
): Promise<string | null> {
	if (!getFileType(name)) {
		return null;
	}

	const sourcePath = resolveProjectFilePath(projectId, fileId);
	const newFileId = getRenamedSiblingId(fileId, name);
	if (!sourcePath || !newFileId) {
		return null;
	}

	const destPath = resolveProjectFilePath(projectId, newFileId);
	if (!destPath) {
		return null;
	}

	if (newFileId === fileId) {
		return newFileId;
	}

	if (!(await isRenamePossible(sourcePath, destPath, "file"))) {
		return null;
	}

	const sourceYjsPath = `${sourcePath}.yjs`;
	const destYjsPath = `${destPath}.yjs`;
	const hasSourceYjs = await fileExists(sourceYjsPath);
	if (hasSourceYjs) {
		return null;
	}

	const canRenameYjs = await isRenamePossible(sourceYjsPath, destYjsPath, "file");
	if (hasSourceYjs && !canRenameYjs) {
		return null;
	}

	await rename(sourcePath, destPath);

	if (hasSourceYjs) {
		await rename(sourceYjsPath, destYjsPath);
	}

	return newFileId;
}

export async function renameProjectFolder(
	projectId: string,
	folderPath: string,
	name: string,
): Promise<string | null> {
	const sourcePath = resolveProjectFilePath(projectId, folderPath);
	const newFolderPath = getRenamedSiblingId(folderPath, name);
	if (!sourcePath || !newFolderPath) {
		return null;
	}

	const destPath = resolveProjectFilePath(projectId, newFolderPath);
	if (!destPath) {
		return null;
	}

	if (newFolderPath === folderPath) {
		return newFolderPath;
	}

	const canRename = await isRenamePossible(sourcePath, destPath, "dir");
	if (!canRename) {
		return null;
	}

	await rename(sourcePath, destPath);

	return newFolderPath;
}

export async function deleteProjectFolder(projectId: string, folderPath: string): Promise<boolean> {
	const dirPath = resolveProjectFilePath(projectId, folderPath);
	if (!dirPath) {
		return false;
	}

	try {
		await rm(dirPath, { recursive: true });
		return true;
	} catch (error) {
		if (isMissingFileError(error)) {
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
		await rm(`${filePath}.yjs`);
	} catch {
		// .yjs companion may not exist for files that were never collab-edited
	}

	return true;
}
