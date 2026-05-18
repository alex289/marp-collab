import { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { getDocumentContent, saveDocumentContent } from "./files.ts";
import { auth } from "../auth.ts";

type CollabContext = {
	userId: string;
	userName: string;
	color: string;
};

const fallbackColors = ["#f97316", "#16a34a", "#0ea5e9", "#e11d48", "#7c3aed", "#db2777"];

const hashString = (value: string): number => {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
};

const persistedUpdates = new Map<string, Uint8Array>();

export const collabServer = new Hocuspocus({
	timeout: 30_000,
	async onAuthenticate({ requestHeaders }: { requestHeaders: Headers }) {
		const session = await auth.api.getSession({ headers: requestHeaders });
		if (!session) {
			throw new Error("Unauthorized");
		}
		const seed = session.user.id;
		return {
			userId: session.user.id,
			userName: session.user.name || session.user.email,
			color: fallbackColors[hashString(seed) % fallbackColors.length] ?? "#0ea5e9",
		} satisfies CollabContext;
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
		const initialContent = await getDocumentContent(documentName);
		text.insert(0, initialContent ?? "# Neue Datei\n");
		return doc;
	},
	async onStoreDocument({ documentName, document }: { documentName: string; document: Y.Doc }) {
		persistedUpdates.set(documentName, Y.encodeStateAsUpdate(document));
		// oxlint-disable-next-line no-base-to-string
		await saveDocumentContent(documentName, document.getText("content").toString());
	},
});
