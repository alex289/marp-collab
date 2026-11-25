import { deepEqual, rejects } from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("a template seed failure leaves no project record or staged files", async (t) => {
	const dataDir = await mkdtemp(join(tmpdir(), "marp-project-provisioning-"));
	t.mock.method(process, "cwd", () => dataDir);
	const originalDataPath = process.env.DATA_PATH;
	process.env.DATA_PATH = dataDir;
	t.after(async () => {
		if (originalDataPath === undefined) {
			delete process.env.DATA_PATH;
		} else {
			process.env.DATA_PATH = originalDataPath;
		}
		await rm(dataDir, { recursive: true, force: true });
	});

	const { db } = await import("../db/db.ts");
	try {
		const { provisionProjectFromTemplate } = await import("./project-provisioning.ts");
		const now = new Date().toISOString();
		db.prepare(
			'insert into "user" (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, 1, ?, ?)',
		).run("owner", "Owner", "owner@example.com", now, now);

		await rejects(
			provisionProjectFromTemplate({ name: "Deck", ownerId: "owner" }, "whs", "Owner"),
			{
				code: "ENOENT",
			},
		);
		deepEqual(db.prepare("select id from project").all(), []);
		deepEqual(await readdir(join(dataDir, "presentations")), []);
	} finally {
		db.close();
	}
});
