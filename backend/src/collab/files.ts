import { Buffer } from "node:buffer";
import { glob, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
			exclude: (dirent) => {
				return (
					dirent.name.startsWith(".") ||
					EXCLUDED_FILE_EXTENSIONS.has(extname(dirent.name).toLowerCase())
				);
			},
		}),
	);

	return entries
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
	data: Buffer;
};

const crc32Table = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
	let value = index;
	for (let bit = 0; bit < 8; bit++) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	crc32Table[index] = value >>> 0;
}

function crc32(data: Buffer): number {
	let value = 0xffffffff;
	for (const byte of data) {
		value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
	}
	return (value ^ 0xffffffff) >>> 0;
}

function createZipArchive(entries: ZipSourceEntry[]): Buffer {
	const localParts: Buffer[] = [];
	const centralParts: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.type === "directory" ? `${entry.path}/` : entry.path);
		const checksum = crc32(entry.data);
		const size = entry.data.length;

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0, 6);
		localHeader.writeUInt16LE(0, 8);
		localHeader.writeUInt16LE(0, 10);
		localHeader.writeUInt16LE(0, 12);
		localHeader.writeUInt32LE(checksum, 14);
		localHeader.writeUInt32LE(size, 18);
		localHeader.writeUInt32LE(size, 22);
		localHeader.writeUInt16LE(name.length, 26);
		localHeader.writeUInt16LE(0, 28);

		localParts.push(localHeader, name, entry.data);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0, 8);
		centralHeader.writeUInt16LE(0, 10);
		centralHeader.writeUInt16LE(0, 12);
		centralHeader.writeUInt16LE(0, 14);
		centralHeader.writeUInt32LE(checksum, 16);
		centralHeader.writeUInt32LE(size, 20);
		centralHeader.writeUInt32LE(size, 24);
		centralHeader.writeUInt16LE(name.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(entry.type === "directory" ? 0x10 : 0, 38);
		centralHeader.writeUInt32LE(offset, 42);

		centralParts.push(centralHeader, name);
		offset += localHeader.length + name.length + entry.data.length;
	}

	const centralDirectoryOffset = offset;
	const centralDirectory = Buffer.concat(centralParts);
	const centralDirectorySize = centralDirectory.length;

	const endRecord = Buffer.alloc(22);
	endRecord.writeUInt32LE(0x06054b50, 0);
	endRecord.writeUInt16LE(0, 4);
	endRecord.writeUInt16LE(0, 6);
	endRecord.writeUInt16LE(entries.length, 8);
	endRecord.writeUInt16LE(entries.length, 10);
	endRecord.writeUInt32LE(centralDirectorySize, 12);
	endRecord.writeUInt32LE(centralDirectoryOffset, 16);
	endRecord.writeUInt16LE(0, 20);

	return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

export async function createProjectZip(projectId: string): Promise<Buffer> {
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
				zipEntries.push({ path: relativePath, type: "directory", data: Buffer.alloc(0) });
				await collectEntries(relativePath);
				continue;
			}

			if (EXCLUDED_FILE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
				continue;
			}

			zipEntries.push({ path: relativePath, type: "file", data: await readFile(fullPath) });
		}
	}

	await collectEntries("");

	return createZipArchive(zipEntries);
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
		return true;
	} catch (error) {
		if (isMissingFileError(error)) {
			return false;
		}
		throw error;
	}
}
