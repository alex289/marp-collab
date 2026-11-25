import { test } from "node:test";
import { equal, ok } from "node:assert/strict";
import {
	beginProjectRepositoryOperation,
	beginProjectSync,
	beginProjectWrite,
	isProjectSyncing,
} from "./project-operations.ts";

test("Git waits for admitted writes and rejects new writes until sync finishes", async () => {
	const release = beginProjectWrite("drain")!;
	ok(release);
	const sync = beginProjectSync("drain");
	ok(sync);
	equal(beginProjectWrite("drain"), null);
	equal(beginProjectSync("drain"), null);
	let drained = false;
	const pending = (async () => {
		await sync.writesDrained;
		drained = true;
	})();
	await Promise.resolve();
	equal(drained, false);
	release();
	release();
	await pending;
	equal(drained, true);
	equal(beginProjectWrite("drain"), null);
	sync.release();
	const next = beginProjectWrite("drain");
	ok(next);
	next();
});

test("settings changes exclude syncs without blocking project writes", () => {
	const releaseRepository = beginProjectRepositoryOperation("configure");
	ok(releaseRepository);
	equal(isProjectSyncing("configure"), false);
	const release = beginProjectWrite("configure");
	ok(release);
	release();
	equal(beginProjectSync("configure"), null);
	equal(beginProjectRepositoryOperation("configure"), null);
	releaseRepository();

	const sync = beginProjectSync("configure");
	ok(sync);
	releaseRepository();
	equal(beginProjectRepositoryOperation("configure"), null);
	sync.release();
});
