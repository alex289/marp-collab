import * as Y from "yjs";
import { collabServer } from "./hocuspocus.ts";
import {
	documentBelongsToProject,
	parseProjectDocumentName,
	toDocumentName,
} from "../projects/document-identity.ts";
import { saveDocumentBinary, saveDocumentContent } from "../projects/storage.ts";

export function broadcastFilesChanged(projectId: string): void {
	for (const [documentName, document] of collabServer.documents) {
		if (documentBelongsToProject(documentName, projectId)) {
			document.broadcastStateless("files-changed");
		}
	}
}

async function flushDocument(documentName: string): Promise<void> {
	const document = collabServer.documents.get(documentName);
	if (!document) {
		return;
	}

	await Promise.all([
		saveDocumentBinary(documentName, Y.encodeStateAsUpdate(document)),
		saveDocumentContent(documentName, document.getText("content").toJSON()),
	]);
}

function folderDocumentNames(projectId: string, folderPath: string): string[] {
	const prefix = `${folderPath}/`;
	return [...collabServer.documents.keys()].filter((documentName) => {
		const parsed = parseProjectDocumentName(documentName);
		return parsed?.projectId === projectId && parsed.fileId.startsWith(prefix);
	});
}

/**
 * Persists the in-memory state of a loaded collab document to its backing
 * files. Call before renaming/moving the file on disk so edits from the last
 * debounce window travel along with it.
 */
export async function flushProjectFileDocument(projectId: string, fileId: string): Promise<void> {
	await flushDocument(toDocumentName(projectId, fileId));
}

export async function flushProjectFolderDocuments(
	projectId: string,
	folderPath: string,
): Promise<void> {
	await Promise.all(folderDocumentNames(projectId, folderPath).map(flushDocument));
}

/**
 * Forces every client editing the file to disconnect. Call after the backing
 * file has been renamed, moved, or deleted — the old document name is dead and
 * clients must not keep writing to it.
 */
export function closeProjectFileDocument(projectId: string, fileId: string): void {
	collabServer.closeConnections(toDocumentName(projectId, fileId));
}

export function closeProjectFolderDocuments(projectId: string, folderPath: string): void {
	for (const documentName of folderDocumentNames(projectId, folderPath)) {
		collabServer.closeConnections(documentName);
	}
}
