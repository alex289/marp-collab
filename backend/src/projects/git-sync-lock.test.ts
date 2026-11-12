import { test } from "node:test";
import { equal, ok } from "node:assert/strict";
import {
	beginGitOperation,
	finishProjectGitConfigure,
	isProjectGitSyncing,
	startProjectGitConfigure,
	beginProjectWrite,
	MAX_CONCURRENT_GIT_OPERATIONS,
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

test("limits how many Git operations run at once", () => {
	const releases = Array.from({ length: MAX_CONCURRENT_GIT_OPERATIONS }, () => beginGitOperation());
	ok(releases.every(Boolean));
	equal(beginGitOperation(), null);
	releases[0]!();
	releases[0]!();
	const next = beginGitOperation();
	ok(next);
	equal(beginGitOperation(), null);
	next();
	for (const release of releases.slice(1)) {
		release!();
	}
});

test("settings changes exclude syncs without blocking project writes", () => {
	ok(startProjectGitConfigure("configure"));
	equal(isProjectGitSyncing("configure"), false);
	const release = beginProjectWrite("configure");
	ok(release);
	release();
	equal(startProjectGitSync("configure"), false);
	equal(startProjectGitConfigure("configure"), false);
	finishProjectGitConfigure("configure");

	ok(startProjectGitSync("configure"));
	equal(startProjectGitConfigure("configure"), false);
	finishProjectGitSync("configure");
});
