import assert from "node:assert/strict";
import test from "node:test";
import { findTextMatches, isCurrentTextMatch } from "./text-search.ts";

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
