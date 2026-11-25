import { glob, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import * as Y from "yjs";
import { DOCUMENT_CONTENT_KEY, toDocumentName } from "../../../shared/collaboration.ts";
import { loadDocumentState } from "../collab/document-state.ts";
import { DOCUMENT_STATE_SUFFIX, documentStatePath } from "./document-state-path.ts";
import { getDeckFiles, getProjectDirectory, saveDocumentBinary } from "./storage.ts";

/** Keep CRDT identities and record Git replacements as edits, so offline peers cannot reinsert old history. */
export async function reconcileProjectDocumentState(projectId: string): Promise<void> {
	const dir = await getProjectDirectory(projectId);
	const files = (await getDeckFiles(projectId)).filter((file) => file.type === "markdown");
	const states = new Set(files.map((file) => documentStatePath(file.id)));
	for (const file of files) {
		const name = toDocumentName(projectId, file.id);
		const document = (await loadDocumentState(name)) ?? new Y.Doc();
		try {
			const content = await readFile(join(dir, file.id), "utf8");
			const text = document.getText(DOCUMENT_CONTENT_KEY);
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
	for await (const entry of glob(`**/*${DOCUMENT_STATE_SUFFIX}`, {
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
