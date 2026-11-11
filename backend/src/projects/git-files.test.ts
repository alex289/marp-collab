import { test } from "node:test";
import { equal } from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSupportedFiles } from "./git-files.ts";

test("replaces a supported directory with a file while retaining unrelated contents", async () => {
	const root = await mkdtemp(join(tmpdir(), "marp-git-files-"));
	try {
		const source = join(root, "source");
		const destination = join(root, "destination");
		await mkdir(source);
		await mkdir(join(destination, "deck.md"), { recursive: true });
		await writeFile(join(destination, "deck.md", "old.md"), "old");
		await writeFile(join(destination, "code.ts"), "code");
		await writeFile(join(source, "deck.md"), "new");
		await syncSupportedFiles(source, destination);
		equal(await readFile(join(destination, "deck.md"), "utf8"), "new");
		equal(await readFile(join(destination, "code.ts"), "utf8"), "code");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
