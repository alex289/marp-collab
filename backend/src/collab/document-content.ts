import { DOCUMENT_CONTENT_KEY } from "../../../shared/collaboration.ts";
import { collabServer } from "./hocuspocus.ts";
import { getDocumentContent } from "../projects/storage.ts";
import { loadDocumentState } from "./document-state.ts";

/** Live edits take precedence over the saved text file. */
export async function getCurrentDocumentContent(documentName: string): Promise<string | undefined> {
	const live = collabServer.documents.get(documentName);
	return live
		? live.getText(DOCUMENT_CONTENT_KEY).toJSON()
		: await getDocumentContent(documentName);
}

/** Use the same CRDT-first order as a collab load, even when an upload made the text file newer. */
export async function getCollabDocumentContent(documentName: string): Promise<string | undefined> {
	const live = collabServer.documents.get(documentName);
	if (live) {
		return live.getText(DOCUMENT_CONTENT_KEY).toJSON();
	}
	const content = await getDocumentContent(documentName);
	if (content === undefined) {
		return undefined;
	}
	const document = await loadDocumentState(documentName);
	if (!document) {
		return content;
	}
	try {
		return document.getText(DOCUMENT_CONTENT_KEY).toJSON();
	} finally {
		document.destroy();
	}
}
