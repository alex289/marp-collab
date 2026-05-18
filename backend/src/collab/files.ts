import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";

export type DeckFile = {
	id: string;
	label: string;
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

async function listMarkdownFiles(projectId: string): Promise<string[]> {
	if (!isValidProjectId(projectId)) {
		throw new Error(`Invalid project id: ${projectId}`);
	}
	const projectDir = resolve(presentationsDir, projectId);
	const files = await Array.fromAsync(
		glob("**/*.{md,markdown}", {
			cwd: projectDir,
			exclude: (p) => p.split("/").some((part) => part.startsWith(".")),
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

	const fileIds = await listMarkdownFiles(projectId);
	return fileIds.map((id) => ({ id, label: id }));
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

export async function saveDocumentContent(documentName: string, content: string): Promise<void> {
	const filePath = resolveDocumentPath(documentName);
	if (!filePath) {
		return;
	}

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
}
