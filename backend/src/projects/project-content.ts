import {
	broadcastFilesChanged,
	closeProjectFileDocument,
	closeProjectFolderDocuments,
	flushProjectFileDocument,
	flushProjectFolderDocuments,
} from "../collab/project-events.ts";
import { getFileType } from "../helpers/file-allowlist.ts";
import { toDocumentName } from "../../../shared/collaboration.ts";
import {
	createProjectDir,
	deleteProjectFile,
	deleteProjectFolder,
	getDeckFiles,
	moveProjectFile,
	renameProjectFile,
	renameProjectFolder,
	relocateProjectEntry,
	saveDocumentContent,
	saveProjectFile,
	type DeckFile,
} from "./storage.ts";

export type ProjectContentEntry = DeckFile & { documentName?: string };

export type RenameProjectContentResult = { ok: true; id: string } | { ok: false };

export type DeleteProjectContentResult = { ok: true } | { ok: false };

function editableContentEntry(projectId: string, fileId: string): ProjectContentEntry {
	return {
		id: fileId,
		label: fileId,
		type: "markdown",
		documentName: toDocumentName(projectId, fileId),
	};
}

export async function listProjectContent(projectId: string): Promise<ProjectContentEntry[]> {
	const files = await getDeckFiles(projectId);
	return files.map((file) => ({
		...file,
		...(file.type === "markdown" ? { documentName: toDocumentName(projectId, file.id) } : {}),
	}));
}

export async function createEditableProjectFile(
	projectId: string,
	fileId: string,
): Promise<ProjectContentEntry> {
	await saveDocumentContent(toDocumentName(projectId, fileId), `\n`);
	broadcastFilesChanged(projectId);
	return editableContentEntry(projectId, fileId);
}

export async function createProjectFolder(projectId: string, folderPath: string): Promise<void> {
	await createProjectDir(projectId, folderPath);
	broadcastFilesChanged(projectId);
}

export async function saveEditableProjectFile(
	projectId: string,
	fileId: string,
	content: string,
): Promise<ProjectContentEntry> {
	await saveDocumentContent(toDocumentName(projectId, fileId), content);
	broadcastFilesChanged(projectId);
	return editableContentEntry(projectId, fileId);
}

export async function saveBinaryProjectFile(
	projectId: string,
	fileId: string,
	data: Uint8Array,
	flag?: "wx",
): Promise<ProjectContentEntry> {
	await saveProjectFile(projectId, fileId, data, flag);
	broadcastFilesChanged(projectId);
	return {
		id: fileId,
		label: fileId,
		type: getFileType(fileId) ?? "asset",
	};
}

async function relocateContent(
	projectId: string,
	path: string,
	kind: "file" | "dir",
	relocate: () => Promise<string | null>,
): Promise<RenameProjectContentResult> {
	const flush = kind === "file" ? flushProjectFileDocument : flushProjectFolderDocuments;
	const close = kind === "file" ? closeProjectFileDocument : closeProjectFolderDocuments;
	await flush(projectId, path);
	const id = await relocate();
	if (!id) {
		return { ok: false };
	}
	if (id !== path) {
		// Let open editors react to the file tree change before closing their connections.
		broadcastFilesChanged(projectId);
		close(projectId, path);
	}
	return { ok: true, id };
}

export function renameProjectContentFile(projectId: string, fileId: string, name: string) {
	return relocateContent(projectId, fileId, "file", () =>
		renameProjectFile(projectId, fileId, name),
	);
}

export function moveProjectContentFile(projectId: string, fileId: string, destination: string) {
	return relocateContent(projectId, fileId, "file", () =>
		moveProjectFile(projectId, fileId, destination),
	);
}

export function renameProjectContentFolder(projectId: string, folderPath: string, name: string) {
	return relocateContent(projectId, folderPath, "dir", () =>
		renameProjectFolder(projectId, folderPath, name),
	);
}

export function moveProjectContentEntry(
	projectId: string,
	path: string,
	destination: string,
	kind: "file" | "dir",
) {
	return relocateContent(projectId, path, kind, () =>
		relocateProjectEntry(projectId, path, destination, kind),
	);
}

export async function deleteProjectContentFile(
	projectId: string,
	fileId: string,
): Promise<DeleteProjectContentResult> {
	if (!(await deleteProjectFile(projectId, fileId))) {
		return { ok: false };
	}

	broadcastFilesChanged(projectId);
	closeProjectFileDocument(projectId, fileId);
	return { ok: true };
}

export async function deleteProjectContentFolder(
	projectId: string,
	folderPath: string,
	recursive?: boolean,
): Promise<DeleteProjectContentResult> {
	if (!(await deleteProjectFolder(projectId, folderPath, recursive))) {
		return { ok: false };
	}

	broadcastFilesChanged(projectId);
	closeProjectFolderDocuments(projectId, folderPath);
	return { ok: true };
}
