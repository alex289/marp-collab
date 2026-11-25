import { collabServer } from "./hocuspocus.ts";
import {
	documentBelongsToProject,
	FILES_CHANGED,
	GIT_SYNC_FINISHED,
	parseProjectDocumentName,
	PROJECT_PRESENCE_DOCUMENT_ID,
	toDocumentName,
} from "../../../shared/collaboration.ts";
import { persistDocument } from "./document-state.ts";

function broadcastProjectEvent(
	projectId: string,
	payload: typeof FILES_CHANGED | typeof GIT_SYNC_FINISHED,
): void {
	for (const [documentName, document] of collabServer.documents) {
		if (documentBelongsToProject(documentName, projectId)) {
			document.broadcastStateless(payload);
		}
	}
}

export function broadcastFilesChanged(projectId: string): void {
	broadcastProjectEvent(projectId, FILES_CHANGED);
}

export function broadcastGitSyncFinished(projectId: string): void {
	broadcastProjectEvent(projectId, GIT_SYNC_FINISHED);
}

async function flushDocument(documentName: string): Promise<void> {
	const document = collabServer.documents.get(documentName);
	if (!document) {
		return;
	}

	await persistDocument(documentName, document);
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

function isProjectFileDocument(documentName: string, projectId: string): boolean {
	const parsed = parseProjectDocumentName(documentName);
	return parsed?.projectId === projectId && parsed.fileId !== PROJECT_PRESENCE_DOCUMENT_ID;
}

/** Must run while the project's Git sync lock is held, which makes collab loads and stores no-ops. */
export async function flushAndCloseProjectDocuments(projectId: string): Promise<void> {
	// Documents that passed authentication before the sync started may still be loading.
	await Promise.allSettled(
		[...collabServer.loadingDocuments.entries()]
			.filter(([documentName]) => isProjectFileDocument(documentName, projectId))
			.map(([, loading]) => loading),
	);
	const documents = [...collabServer.documents.entries()].filter(([documentName]) =>
		isProjectFileDocument(documentName, projectId),
	);

	// Close first so no edit can arrive after the final flush.
	for (const [documentName] of documents) {
		collabServer.closeConnections(documentName);
	}
	await Promise.all(
		documents.map(async ([documentName, document]) => {
			await collabServer.debouncer.executeNow(`onStoreDocument-${documentName}`);
			await document.saveMutex.waitForUnlock();
			await flushDocument(documentName);
			await collabServer.unloadDocument(document);
		}),
	);
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

export function closeProjectDocuments(projectId: string): void {
	for (const documentName of collabServer.documents.keys()) {
		if (documentBelongsToProject(documentName, projectId)) {
			collabServer.closeConnections(documentName);
		}
	}
}
