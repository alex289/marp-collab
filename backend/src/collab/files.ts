import { glob, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve, sep } from "node:path";
import { getFileType, MARKDOWN_EXTENSIONS } from "../helpers/file-allowlist.ts";

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

async function listProjectFiles(projectId: string): Promise<string[]> {
	if (!isValidProjectId(projectId)) {
		throw new Error(`Invalid project id: ${projectId}`);
	}
	const projectDir = resolve(presentationsDir, projectId);
	const files = await Array.fromAsync(
		glob("**/{*.{md,markdown,jpg,jpeg,png,gif,webp,svg,bmp,tiff,css},.keep}", {
			cwd: projectDir,
			exclude: (p) => p.split("/").some((part) => part.startsWith(".") && part !== ".keep"),
		}),
	);
	return files.sort((a, b) => a.localeCompare(b));
}

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

	const fileIds = await listProjectFiles(projectId);
	return fileIds.map((rawId) => {
		const id = rawId.replace(/\\/g, "/");
		if (id.endsWith("/.keep")) {
			const folderPath = id.slice(0, -"/.keep".length);
			return { id: folderPath, label: folderPath, type: "folder" as const };
		}
		return { id, label: id, type: getFileType(id) ?? ("asset" as const) };
	});
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
	await writeFile(resolve(dir, ".keep"), "");
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

function resolveProjectFilePath(projectId: string, fileId: string): string | null {
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

export async function getProjectFile(
	projectId: string,
	fileId: string,
): Promise<Buffer | undefined> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return undefined;
	}

	try {
		return await readFile(filePath);
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
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
	return newFileId;
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<boolean> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return false;
	}

	try {
		await rm(filePath);
		return true;
	} catch (error) {
		if (isMissingFileError(error)) {
			return false;
		}
		throw error;
	}
}
