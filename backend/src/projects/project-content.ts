import {
	broadcastFilesChanged,
	closeProjectFileDocument,
	closeProjectFolderDocuments,
	flushProjectFileDocument,
	flushProjectFolderDocuments,
} from "../collab/project-events.ts";
import { getFileType } from "../helpers/file-allowlist.ts";
import { toDocumentName } from "./document-identity.ts";
import {
	createProjectDir,
	deleteProjectFile,
	deleteProjectFolder,
	getDeckFiles,
	moveProjectFile,
	renameProjectFile,
	renameProjectFolder,
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
): Promise<ProjectContentEntry> {
	await saveProjectFile(projectId, fileId, data);
	broadcastFilesChanged(projectId);
	return {
		id: fileId,
		label: fileId,
		type: getFileType(fileId) ?? "asset",
	};
}

export async function renameProjectContentFile(
	projectId: string,
	fileId: string,
	name: string,
): Promise<RenameProjectContentResult> {
	await flushProjectFileDocument(projectId, fileId);
	const id = await renameProjectFile(projectId, fileId, name);
	if (!id) {
		return { ok: false };
	}

	// Broadcast before closing so clients still editing the old document
	// receive "files-changed" and switch away, then force the disconnect.
	broadcastFilesChanged(projectId);
	closeProjectFileDocument(projectId, fileId);
	return { ok: true, id };
}

export async function moveProjectContentFile(
	projectId: string,
	fileId: string,
	destination: string,
): Promise<RenameProjectContentResult> {
	await flushProjectFileDocument(projectId, fileId);
	const id = await moveProjectFile(projectId, fileId, destination);
	if (!id) {
		return { ok: false };
	}

	broadcastFilesChanged(projectId);
	closeProjectFileDocument(projectId, fileId);
	return { ok: true, id };
}

export async function renameProjectContentFolder(
	projectId: string,
	folderPath: string,
	name: string,
): Promise<RenameProjectContentResult> {
	await flushProjectFolderDocuments(projectId, folderPath);
	const id = await renameProjectFolder(projectId, folderPath, name);
	if (!id) {
		return { ok: false };
	}

	broadcastFilesChanged(projectId);
	closeProjectFolderDocuments(projectId, folderPath);
	return { ok: true, id };
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
): Promise<DeleteProjectContentResult> {
	if (!(await deleteProjectFolder(projectId, folderPath))) {
		return { ok: false };
	}

	broadcastFilesChanged(projectId);
	closeProjectFolderDocuments(projectId, folderPath);
	return { ok: true };
}
