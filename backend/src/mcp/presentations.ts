import { createHash } from "node:crypto";
import { collabServer } from "../collab/hocuspocus.ts";
import { getCollabDocumentContent } from "../collab/document-content.ts";
import { broadcastFilesChanged, flushProjectFileDocument } from "../collab/project-events.ts";
import { getProjectAuthorization } from "../projects/access-policy.ts";
import { beginProjectWrite } from "../projects/git-sync-lock.ts";
import { toDocumentName } from "../projects/document-identity.ts";
import {
	createDocumentContent,
	documentFileExists,
	getDocumentContent,
} from "../projects/storage.ts";

export class PresentationToolError extends Error {}

export function requirePresentationAccess(projectId: string, userId: string, write = false): void {
	if (!getProjectAuthorization(projectId, userId, write ? "write" : "read").allowed) {
		throw new PresentationToolError("Project not found or access denied.");
	}
}

export function contentRevision(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export async function readPresentation(projectId: string, fileId: string, userId: string) {
	requirePresentationAccess(projectId, userId);
	// edit_presentation loads through Hocuspocus, so revisions must hash the same source.
	const content = await getCollabDocumentContent(toDocumentName(projectId, fileId));
	requirePresentationAccess(projectId, userId);
	if (content === undefined) {
		throw new PresentationToolError("Presentation not found.");
	}
	return { projectId, fileId, content, revision: contentRevision(content) };
}

export async function writePresentation(
	projectId: string,
	fileId: string,
	userId: string,
	content: string,
	expectedRevision?: string,
) {
	requirePresentationAccess(projectId, userId, true);
	const release = beginProjectWrite(projectId);
	if (!release) {
		throw new PresentationToolError(
			"Project is syncing with Git. Try again after synchronization.",
		);
	}
	try {
		const documentName = toDocumentName(projectId, fileId);
		if (expectedRevision === undefined) {
			try {
				await createDocumentContent(documentName, content);
			} catch (error) {
				const code = error instanceof Error && "code" in error ? error.code : undefined;
				if (code === "EEXIST" || code === "ENOTDIR" || code === "EISDIR") {
					// mkdir also fails this way when a parent path segment is a file.
					throw new PresentationToolError(
						(await getDocumentContent(documentName)) === undefined
							? "Path conflicts with an existing file or folder."
							: "File already exists. Read it before editing.",
					);
				}
				throw error;
			}
			broadcastFilesChanged(projectId);
		} else {
			if (!(await documentFileExists(documentName))) {
				throw new PresentationToolError("Presentation not found.");
			}
			// Loading through Hocuspocus preserves the persisted CRDT and joins any live editors.
			const connection = await collabServer.openDirectConnection(documentName, { userId });
			try {
				await connection.transact((document) => {
					requirePresentationAccess(projectId, userId, true);
					const text = document.getText("content");
					const previous = text.toJSON();
					if (contentRevision(previous) !== expectedRevision) {
						throw new PresentationToolError(
							"Presentation changed. Read it again and reapply your edit.",
						);
					}
					// Retain unchanged characters and their CRDT identities.
					let start = 0;
					while (
						start < previous.length &&
						start < content.length &&
						previous[start] === content[start]
					) {
						start++;
					}
					let end = 0;
					while (
						end < previous.length - start &&
						end < content.length - start &&
						previous[previous.length - 1 - end] === content[content.length - 1 - end]
					) {
						end++;
					}
					// Yjs indexes UTF-16 units; do not split emoji/surrogate pairs.
					const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
					if (start > 0 && isLowSurrogate(previous.charCodeAt(start))) {
						start--;
					}
					if (end > 0 && isLowSurrogate(previous.charCodeAt(previous.length - end))) {
						end--;
					}
					text.delete(start, previous.length - start - end);
					text.insert(start, content.slice(start, content.length - end));
				});
				// A Git sync can reserve the project while waiting for this admitted write.
				// Its reservation disables normal store hooks, and disconnecting unloads the
				// document before the sync can flush it, so flush unconditionally
				// unless a rename, move or delete removed the file meanwhile.
				if (!(await documentFileExists(documentName))) {
					throw new PresentationToolError(
						"Presentation was renamed, moved or deleted during the edit. List files and try again.",
					);
				}
				await flushProjectFileDocument(projectId, fileId);
			} finally {
				// Store hooks persist Markdown and Yjs state before reporting success.
				await connection.disconnect();
			}
		}
		return { projectId, fileId, revision: contentRevision(content) };
	} finally {
		release();
	}
}
