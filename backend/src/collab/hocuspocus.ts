import { type ConnectionConfiguration, Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import {
	GIT_SYNC_REJECTION_REASON,
	PROJECT_PRESENCE_DOCUMENT_ID,
	parseProjectDocumentName,
} from "../../../shared/collaboration.ts";
import { documentFileExists } from "../projects/storage.ts";
import { loadProjectDocument, persistDocument } from "./document-state.ts";
import { isEditableExtension } from "../helpers/file-allowlist.ts";
import { auth } from "../auth.ts";
import { getProjectAuthorization } from "../projects/access-policy.ts";
import { registerProjectConnection, unregisterProjectConnection } from "./connections.ts";
import { logger } from "../helpers/logger.ts";
import { isProjectSyncing } from "../projects/project-operations.ts";

function isProjectPresenceDocument(documentName: string): boolean {
	const parsed = parseProjectDocumentName(documentName);
	return parsed?.fileId === PROJECT_PRESENCE_DOCUMENT_ID;
}

function isSyncingProjectDocument(documentName: string): boolean {
	const parsed = parseProjectDocumentName(documentName);
	return (
		parsed !== null &&
		parsed.fileId !== PROJECT_PRESENCE_DOCUMENT_ID &&
		isProjectSyncing(parsed.projectId)
	);
}

function gitSyncRejection(): Error {
	// Hocuspocus forwards only `reason` to the client; the message alone becomes "permission-denied".
	return Object.assign(new Error(GIT_SYNC_REJECTION_REASON), { reason: GIT_SYNC_REJECTION_REASON });
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
		// Hocuspocus does not log exceptions from this hook.
		try {
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

			const authorization = getProjectAuthorization(projectId, session.user.id, "read");
			if (!authorization.allowed) {
				throw new Error("Forbidden");
			}
			if (isSyncingProjectDocument(documentName)) {
				throw gitSyncRejection();
			}

			connectionConfig.readOnly = authorization.access.readOnly;

			return { userId: session.user.id };
		} catch (error) {
			logger.error({ err: error, documentName }, "collab onAuthenticate failed");
			throw error;
		}
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
		// A connection authenticated just before a sync started must not load pre-sync content.
		if (isSyncingProjectDocument(documentName)) {
			throw gitSyncRejection();
		}
		try {
			if (isProjectPresenceDocument(documentName)) {
				return new Y.Doc();
			}

			const document = await loadProjectDocument(documentName);
			if (!document) {
				// Refuse to reopen a renamed or deleted file from a stale client connection.
				throw new Error(`Document not found: ${documentName}`);
			}

			return document;
		} catch (error) {
			logger.error({ err: error, documentName }, "collab onLoadDocument failed");
			throw error;
		}
	},
	async onStoreDocument({ documentName, document }: { documentName: string; document: Y.Doc }) {
		try {
			// Git sync flushes documents itself before closing them; later stores would overwrite pulled files.
			if (isProjectPresenceDocument(documentName) || isSyncingProjectDocument(documentName)) {
				return;
			}

			if (!(await documentFileExists(documentName))) {
				// A pending store must not recreate a renamed or deleted file.
				return;
			}

			await persistDocument(documentName, document);
		} catch (error) {
			logger.error({ err: error, documentName }, "collab onStoreDocument failed");
			throw error;
		}
	},
});
