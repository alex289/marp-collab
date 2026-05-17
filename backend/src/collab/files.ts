import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export type DeckFile = {
	id: string;
	label: string;
};

const dataDir = resolve(process.cwd(), process.env.DATA_PATH ?? "data");
const presentationsDir = resolve(dataDir, "presentations");

// To-Do: Implement project system
export const PROJECT_ID = "main";
const FILE_PREFIX = `project/${PROJECT_ID}/`;

function resolveDocumentPath(documentName: string): string | null {
	if (!documentName.startsWith(FILE_PREFIX)) {
		return null;
	}

	const fileId = documentName.slice(FILE_PREFIX.length);
	if (!fileId) {
		return null;
	}

	if (isAbsolute(fileId) || fileId.split("/").includes("..")) {
		throw new Error(`Invalid presentation file id: ${fileId}`);
	}

	return resolve(presentationsDir, fileId);
}

function isMissingFileError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function listMarkdownFiles(): Promise<string[]> {
	const files = await Array.fromAsync(
		glob("**/*.{md,markdown}", {
			cwd: presentationsDir,
			exclude: (p) => p.split("/").some((part) => part.startsWith(".")),
		}),
	);
	return files.sort((a, b) => a.localeCompare(b));
}

async function ensurePresentationsDir(): Promise<void> {
	await mkdir(presentationsDir, { recursive: true });
}

export function toDocumentName(fileId: string): string {
	return `${FILE_PREFIX}${fileId}`;
}

export async function getDeckFiles(): Promise<DeckFile[]> {
	await ensurePresentationsDir();

	const fileIds = await listMarkdownFiles();
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
