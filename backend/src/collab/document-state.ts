import * as Y from "yjs";
import { DOCUMENT_CONTENT_KEY } from "../../../shared/collaboration.ts";
import {
	getDocumentBinary,
	getDocumentContent,
	saveDocumentBinary,
	saveDocumentContent,
} from "../projects/storage.ts";

export async function loadDocumentState(documentName: string): Promise<Y.Doc | undefined> {
	const binary = await getDocumentBinary(documentName);
	if (!binary) {
		return undefined;
	}

	const document = new Y.Doc();
	try {
		Y.applyUpdate(document, binary);
		return document;
	} catch (error) {
		document.destroy();
		throw error;
	}
}

export async function loadProjectDocument(documentName: string): Promise<Y.Doc | undefined> {
	const saved = await loadDocumentState(documentName);
	if (saved) {
		return saved;
	}

	const content = await getDocumentContent(documentName);
	if (content === undefined) {
		return undefined;
	}

	const document = new Y.Doc();
	document.getText(DOCUMENT_CONTENT_KEY).insert(0, content);
	return document;
}

export async function persistDocument(documentName: string, document: Y.Doc): Promise<void> {
	const binary = Y.encodeStateAsUpdate(document);
	const content = document.getText(DOCUMENT_CONTENT_KEY).toJSON();
	await Promise.all([
		saveDocumentBinary(documentName, binary),
		saveDocumentContent(documentName, content),
	]);
}
