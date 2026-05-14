import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

export type DeckFile = {
	id: string;
	label: string;
};

export const PROJECT_ID = "main";
const FILE_PREFIX = `project/${PROJECT_ID}/`;
const dataDir = resolve(process.cwd(), process.env.DATA_PATH ?? "data");
const presentationsDir = resolve(dataDir, "presentations");
const markdownExtensions = new Set([".md", ".markdown"]);

const toUnixPath = (value: string): string => value.split(sep).join("/");

const fromDocumentName = (documentName: string): string | null => {
	if (!documentName.startsWith(FILE_PREFIX)) {
		return null;
	}

	const fileId = documentName.slice(FILE_PREFIX.length);
	return fileId.length > 0 ? fileId : null;
};

const toPresentationPath = (fileId: string): string => {
	const normalizedFileId = toUnixPath(fileId).replace(/^\/+/, "");
	const absolutePath = resolve(presentationsDir, normalizedFileId);
	const relativePath = relative(presentationsDir, absolutePath);

	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		throw new Error(`Invalid presentation file id: ${fileId}`);
	}

	return absolutePath;
};

const isMissingFileError = (error: unknown): boolean => {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return false;
	}

	return (error as NodeJS.ErrnoException).code === "ENOENT";
};

const listMarkdownFileIds = async (directory: string, prefix = ""): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const fileIds: string[] = [];

	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (entry.name.startsWith(".")) {
			continue;
		}

		const entryPath = resolve(directory, entry.name);
		const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			const nestedFileIds = await listMarkdownFileIds(entryPath, nextPrefix);
			fileIds.push(...nestedFileIds);
			continue;
		}

		if (entry.isFile() && markdownExtensions.has(extname(entry.name).toLowerCase())) {
			fileIds.push(toUnixPath(nextPrefix));
		}
	}

	return fileIds;
};

const ensurePresentationsDir = async (): Promise<void> => {
	await mkdir(presentationsDir, { recursive: true });
};

export const toDocumentName = (fileId: string): string => `${FILE_PREFIX}${fileId}`;

export const getDeckFiles = async (): Promise<DeckFile[]> => {
	await ensurePresentationsDir();

	const fileIds = await listMarkdownFileIds(presentationsDir);
	return fileIds.map((id) => ({ id, label: id }));
};

export const getInitialDocumentContent = async (
	documentName: string,
): Promise<string | undefined> => {
	const fileId = fromDocumentName(documentName);
	if (!fileId) {
		return undefined;
	}

	try {
		return await readFile(toPresentationPath(fileId), "utf8");
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}

		throw error;
	}
};

export const saveDocumentContent = async (documentName: string, content: string): Promise<void> => {
	const fileId = fromDocumentName(documentName);
	if (!fileId) {
		return;
	}

	const filePath = toPresentationPath(fileId);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
};
