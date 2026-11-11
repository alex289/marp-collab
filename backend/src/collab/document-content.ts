import { collabServer } from "./hocuspocus.ts";
import { getDocumentContent } from "../projects/storage.ts";

/** Read active edits before falling back to the persisted document. */
export async function getCurrentDocumentContent(documentName: string): Promise<string | undefined> {
	const live = collabServer.documents.get(documentName);
	return live ? live.getText("content").toJSON() : await getDocumentContent(documentName);
}
