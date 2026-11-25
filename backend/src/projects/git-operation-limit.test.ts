import { test } from "node:test";
import { equal, ok } from "node:assert/strict";
import { beginGitOperation, MAX_CONCURRENT_GIT_OPERATIONS } from "./git-operation-limit.ts";

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
