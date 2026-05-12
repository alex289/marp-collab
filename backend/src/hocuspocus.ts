import { Server } from "@hocuspocus/server";
import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import * as Y from "yjs";
import { initialDocumentContent } from "./files.js";

type CollabContext = {
	userId: string;
	userName: string;
	color: string;
};

const fallbackColors = ["#f97316", "#16a34a", "#0ea5e9", "#e11d48", "#7c3aed", "#db2777"];

const persistedUpdates = new Map<string, Uint8Array>();

const makeGuestContext = (): CollabContext => {
	const color = fallbackColors[Math.floor(Math.random() * fallbackColors.length)] ?? "#0ea5e9";
	const guestId = randomUUID();

	return {
		userId: guestId,
		userName: `Guest-${guestId.slice(0, 4)}`,
		color,
	};
};

const parseAuthToken = (token?: string): CollabContext => {
	if (!token) {
		return makeGuestContext();
	}

	try {
		const parsed = JSON.parse(token) as Partial<CollabContext>;
		if (parsed.userId && parsed.userName && parsed.color) {
			return {
				userId: parsed.userId,
				userName: parsed.userName,
				color: parsed.color,
			};
		}
	} catch {
		return makeGuestContext();
	}

	return makeGuestContext();
};

export const attachCollabServer = (collabServer: Server, httpServer: HttpServer): void => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const crossws = (collabServer as any).crossws;
	const { hocuspocus } = collabServer;

	httpServer.on("upgrade", async (request, socket, head) => {
		try {
			await hocuspocus.hooks("onUpgrade", { request, socket, head, instance: hocuspocus });
			crossws.handleUpgrade(request, socket, head);
		} catch (error) {
			if (error) {
				throw error;
			}
		}
	});
};

export const createCollabServer = (): Server => {
	return new Server<CollabContext>({
		timeout: 30_000,
		async onAuthenticate({ token }: { token?: string }) {
			return parseAuthToken(token);
		},
		async onLoadDocument({ documentName }: { documentName: string }) {
			const persisted = persistedUpdates.get(documentName);
			if (persisted) {
				const doc = new Y.Doc();
				Y.applyUpdate(doc, persisted);
				return doc;
			}

			const doc = new Y.Doc();
			const text = doc.getText("content");
			text.insert(0, initialDocumentContent.get(documentName) ?? "# Neue Datei\n");
			return doc;
		},
		async onStoreDocument({ documentName, document }: { documentName: string; document: Y.Doc }) {
			persistedUpdates.set(documentName, Y.encodeStateAsUpdate(document));
		},
	});
};
