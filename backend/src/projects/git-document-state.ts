import { glob, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import * as Y from "yjs";
import { toDocumentName } from "./document-identity.ts";
import {
	getDeckFiles,
	getDocumentBinary,
	getProjectDirectory,
	saveDocumentBinary,
} from "./storage.ts";

/** Keep CRDT identities and record Git replacements as edits, so offline peers cannot reinsert old history. */
export async function reconcileProjectDocumentState(projectId: string): Promise<void> {
	const dir = await getProjectDirectory(projectId);
	const files = (await getDeckFiles(projectId)).filter((file) => file.type === "markdown");
	const states = new Set(files.map((file) => `${file.id}.yjs`));
	for (const file of files) {
		const name = toDocumentName(projectId, file.id);
		const document = new Y.Doc();
		try {
			const saved = await getDocumentBinary(name);
			if (saved) {
				Y.applyUpdate(document, saved);
			}
			const content = await readFile(join(dir, file.id), "utf8");
			const text = document.getText("content");
			if (text.toJSON() !== content) {
				document.transact(() => {
					text.delete(0, text.length);
					text.insert(0, content);
				});
			}
			await saveDocumentBinary(name, Y.encodeStateAsUpdate(document));
		} finally {
			document.destroy();
		}
	}
	for await (const entry of glob("**/*.yjs", {
		cwd: dir,
		exclude: [".git/**"],
		withFileTypes: true,
	})) {
		const file = relative(dir, join(entry.parentPath, entry.name));
		if (entry.isFile() && !states.has(file)) {
			await rm(join(dir, file));
		}
	}
}
