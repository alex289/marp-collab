import { Hocuspocus } from "@hocuspocus/server";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { initialDocumentContent } from "./files.ts";

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

export const collabServer = new Hocuspocus({
	timeout: 30_000,
	// oxlint-disable-next-line require-await
	async onAuthenticate({ token }: { token?: string }) {
		return parseAuthToken(token);
	},
	// oxlint-disable-next-line require-await
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
	// oxlint-disable-next-line require-await
	async onStoreDocument({ documentName, document }: { documentName: string; document: Y.Doc }) {
		persistedUpdates.set(documentName, Y.encodeStateAsUpdate(document));
	},
});
