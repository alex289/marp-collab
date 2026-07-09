import { type ConnectionConfiguration, Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import {
	getDocumentBinary,
	getDocumentContent,
	saveDocumentBinary,
	saveDocumentContent,
} from "./files.ts";
import { isEditableExtension } from "../helpers/file-allowlist.ts";
import { auth } from "../auth.ts";
import { getUserProjectAccess } from "../helpers/project-auth.ts";
import { registerProjectConnection, unregisterProjectConnection } from "./connections.ts";

type CollabContext = {
	userId: string;
	userName: string;
	color: string;
	readOnly: boolean;
};

const fallbackColors = ["#f97316", "#16a34a", "#0ea5e9", "#e11d48", "#7c3aed", "#db2777"];
const PROJECT_PRESENCE_DOCUMENT_ID = "__presence";

const hashString = (value: string): number => {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
};

function parseProjectDocumentName(
	documentName: string,
): { projectId: string; fileId: string } | null {
	const parts = documentName.split("/");
	if (parts[0] !== "project" || !parts[1]) {
		return null;
	}

	return {
		projectId: parts[1],
		fileId: parts.slice(2).join("/"),
	};
}

function isProjectPresenceDocument(documentName: string): boolean {
	const parsed = parseProjectDocumentName(documentName);
	return parsed?.fileId === PROJECT_PRESENCE_DOCUMENT_ID;
}

export const collabServer = new Hocuspocus({
	timeout: 30_000,
	async onAuthenticate({
		requestHeaders,
		documentName,
		connectionConfig,
	}: {
		requestHeaders: Headers;
		documentName: string;
		connectionConfig: ConnectionConfiguration;
	}) {
		const session = await auth.api.getSession({ headers: requestHeaders });
		if (!session) {
			throw new Error("Unauthorized");
		}

		const parsed = parseProjectDocumentName(documentName);
		if (!parsed) {
			throw new Error("Invalid document name");
		}
		const { projectId, fileId } = parsed;
		if (fileId !== PROJECT_PRESENCE_DOCUMENT_ID && !isEditableExtension(fileId)) {
			throw new Error("Only text files can be opened in the editor");
		}

		const access = getUserProjectAccess(projectId, session.user.id);
		if (!access) {
			throw new Error("Forbidden");
		}

		connectionConfig.readOnly = access.readOnly;

		return {
			userId: session.user.id,
			userName: session.user.name || session.user.email,
			color: fallbackColors[hashString(session.user.id) % fallbackColors.length] ?? "#0ea5e9",
			readOnly: access.readOnly,
		} satisfies CollabContext;
	},
	// oxlint-disable-next-line require-await
	async connected({ socketId, documentName, context, connection }) {
		registerProjectConnection({
			socketId,
			documentName,
			userId: context.userId,
			connection: connection.webSocket,
		});
	},
	// oxlint-disable-next-line require-await
	async onDisconnect({ socketId, documentName }) {
		unregisterProjectConnection(socketId, documentName);
	},
	async onLoadDocument({ documentName }: { documentName: string }) {
		if (isProjectPresenceDocument(documentName)) {
			return new Y.Doc();
		}

		const binary = await getDocumentBinary(documentName);
		if (binary) {
			const doc = new Y.Doc();
			Y.applyUpdate(doc, binary);
			return doc;
		}

		const doc = new Y.Doc();
		const text = doc.getText("content");
		const initialContent = await getDocumentContent(documentName);
		text.insert(0, initialContent ?? "");
		return doc;
	},
	async onStoreDocument({ documentName, document }: { documentName: string; document: Y.Doc }) {
		if (isProjectPresenceDocument(documentName)) {
			return;
		}

		const binary = Y.encodeStateAsUpdate(document);
		await Promise.all([
			saveDocumentBinary(documentName, binary),
			saveDocumentContent(documentName, document.getText("content").toJSON()),
		]);
	},
});
