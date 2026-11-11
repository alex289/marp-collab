import { test } from "node:test";
import { equal } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as Y from "yjs";

test("an offline document merges after a Git pull without resurrecting pre-pull text", async () => {
	const dir = await mkdtemp(join(tmpdir(), "marp-git-state-"));
	process.env.DATA_PATH = dir;
	const storage = await import("./storage.ts");
	const { reconcileProjectDocumentState } = await import("./git-document-state.ts");
	const offline = new Y.Doc();
	const server = new Y.Doc();
	try {
		offline.getText("content").insert(0, "old content");
		await storage.saveDocumentBinary("project/offline/deck.md", Y.encodeStateAsUpdate(offline));
		await storage.saveDocumentContent("project/offline/deck.md", "new remote content");
		await reconcileProjectDocumentState("offline");
		Y.applyUpdate(server, (await storage.getDocumentBinary("project/offline/deck.md"))!);
		Y.applyUpdate(server, Y.encodeStateAsUpdate(offline));
		equal(server.getText("content").toJSON(), "new remote content");
		Y.applyUpdate(offline, Y.encodeStateAsUpdate(server));
		equal(offline.getText("content").toJSON(), "new remote content");
		await storage.deleteProjectFile("offline", "deck.md");
		await reconcileProjectDocumentState("offline");
		equal(await storage.getDocumentBinary("project/offline/deck.md"), undefined);
	} finally {
		offline.destroy();
		server.destroy();
		await rm(dir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	}
});
