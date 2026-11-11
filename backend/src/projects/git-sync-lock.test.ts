import { test } from "node:test";
import { equal, ok } from "node:assert/strict";
import {
	beginProjectWrite,
	startProjectGitSync,
	waitForProjectWrites,
	finishProjectGitSync,
} from "./git-sync-lock.ts";

test("Git waits for admitted writes and rejects new writes until sync finishes", async () => {
	const release = beginProjectWrite("drain")!;
	ok(release);
	ok(startProjectGitSync("drain"));
	equal(beginProjectWrite("drain"), null);
	equal(startProjectGitSync("drain"), false);
	let drained = false;
	const pending = (async () => {
		await waitForProjectWrites("drain");
		drained = true;
	})();
	await Promise.resolve();
	equal(drained, false);
	release();
	release();
	await pending;
	equal(drained, true);
	equal(beginProjectWrite("drain"), null);
	finishProjectGitSync("drain");
	const next = beginProjectWrite("drain");
	ok(next);
	next();
});
