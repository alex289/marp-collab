import * as Y from "yjs";
import { collabServer } from "./hocuspocus.ts";
import { getDocumentBinary, getDocumentContent } from "../projects/storage.ts";

/** Read active edits before falling back to the persisted document. */
export async function getCurrentDocumentContent(documentName: string): Promise<string | undefined> {
	const live = collabServer.documents.get(documentName);
	return live ? live.getText("content").toJSON() : await getDocumentContent(documentName);
}

/**
 * Read the content a collab load would produce. Like onLoadDocument, persisted
 * CRDT state wins over the plain-text file, which can be newer after an upload.
 */
export async function getCollabDocumentContent(documentName: string): Promise<string | undefined> {
	const live = collabServer.documents.get(documentName);
	if (live) {
		return live.getText("content").toJSON();
	}
	const content = await getDocumentContent(documentName);
	if (content === undefined) {
		return undefined;
	}
	const binary = await getDocumentBinary(documentName);
	if (!binary) {
		return content;
	}
	const document = new Y.Doc();
	try {
		Y.applyUpdate(document, binary);
		return document.getText("content").toJSON();
	} finally {
		document.destroy();
	}
}
