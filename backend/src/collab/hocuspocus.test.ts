import { after, before, test } from "node:test";
import { equal, rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as Y from "yjs";

let tempDir: string;
let collab: typeof import("./hocuspocus.ts");
let lock: typeof import("../projects/git-sync-lock.ts");
let storage: typeof import("../projects/storage.ts");

before(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "marp-test-hocuspocus-"));
	process.env.DATA_PATH = tempDir;
	process.env.AUTH_SECRET = "hocuspocus-test-secret";
	collab = await import("./hocuspocus.ts");
	lock = await import("../projects/git-sync-lock.ts");
	storage = await import("../projects/storage.ts");
});

after(async () => {
	await rm(tempDir, { recursive: true, force: true });
	delete process.env.DATA_PATH;
	delete process.env.AUTH_SECRET;
});

test("refuses to load or store project documents while the project syncs with Git", async () => {
	const documentName = "project/syncing/deck.md";
	await storage.saveDocumentContent(documentName, "pulled");
	const document = new Y.Doc();
	document.getText("content").insert(0, "stale");

	lock.startProjectGitSync("syncing");
	try {
		await rejects(
			collab.collabServer.configuration.onLoadDocument!({ documentName } as never),
			// The reason, not the message, is what reaches the client.
			{ reason: collab.GIT_SYNC_REJECTION_REASON },
		);
		await collab.collabServer.configuration.onStoreDocument!({ documentName, document } as never);
		equal(await storage.getDocumentContent(documentName), "pulled");
	} finally {
		lock.finishProjectGitSync("syncing");
		document.destroy();
	}
});
