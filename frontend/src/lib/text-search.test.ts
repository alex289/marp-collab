import assert from "node:assert/strict";
import test from "node:test";
import {
	findTextMatches,
	getMatchPreviewSegments,
	isCurrentTextMatch,
	mergeActiveFileSearchResults,
} from "./text-search.ts";

test("finds case-insensitive literal matches at offsets in the original document", () => {
	const content = "İ\r\nA+B and a+b";
	const matches = findTextMatches(content, "a+b");
	assert.deepEqual(
		matches.map(({ line, startOffset, endOffset, matchedText }) => ({
			line,
			startOffset,
			endOffset,
			matchedText,
		})),
		[
			{ line: 2, startOffset: 3, endOffset: 6, matchedText: "A+B" },
			{ line: 2, startOffset: 11, endOffset: 14, matchedText: "a+b" },
		],
	);
	assert.ok(matches.every((match) => isCurrentTextMatch(content, match)));
});

test("supports case-sensitive search and maxMatches capping", () => {
	const content = "Hello hello HELLO hello";
	const sensitive = findTextMatches(content, "hello", { caseSensitive: true });
	assert.deepEqual(
		sensitive.map((match) => match.startOffset),
		[6, 18],
	);

	const capped = findTextMatches(content, "hello", { maxMatches: 2 });
	assert.equal(capped.length, 2);
	assert.deepEqual(
		capped.map((match) => match.matchedText),
		["Hello", "hello"],
	);
});

test("splits preview lines around a match and trims long leading context", () => {
	const prefix = "a".repeat(40);
	const match = findTextMatches(`${prefix}TARGET suffix`, "target")[0]!;
	assert.deepEqual(getMatchPreviewSegments(match, 10), {
		before: `…${"a".repeat(10)}`,
		match: "TARGET",
		after: " suffix",
	});

	const longLine = `${"x".repeat(300)}😀TARGET${"y".repeat(300)}`;
	const clipped = findTextMatches(longLine, "target")[0]!;
	assert.ok(clipped.linePreview.length < 250);
	assert.ok(clipped.linePreview.startsWith("…"));
	assert.ok(clipped.linePreview.endsWith("…"));
	assert.equal(getMatchPreviewSegments(clipped, 5).match, "TARGET");
	assert.ok(!getMatchPreviewSegments(clipped, 1).before.includes("\uFFFD"));
});

test("merges live active file matches into server project search results", () => {
	const serverFiles = [
		{ fileId: "a.md", matches: findTextMatches("hello world", "hello") },
		{ fileId: "b.md", matches: findTextMatches("old hello", "hello") },
	];

	const updated = mergeActiveFileSearchResults(
		serverFiles,
		"b.md",
		"hello one\nhello two",
		"hello",
		false,
	);
	assert.deepEqual(
		updated.files.map((file) => [file.fileId, file.matches.length]),
		[
			["a.md", 1],
			["b.md", 2],
		],
	);
	assert.equal(updated.totalMatches, 3);

	const cleared = mergeActiveFileSearchResults(serverFiles, "b.md", "no hits here", "hello", false);
	assert.deepEqual(
		cleared.files.map((file) => file.fileId),
		["a.md"],
	);
	assert.equal(cleared.totalMatches, 1);
});
