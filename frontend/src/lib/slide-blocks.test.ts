import assert from "node:assert/strict";
import test from "node:test";
import {
	computeMinimalSplice,
	joinDeckBlocks,
	moveSlide,
	splitDeckIntoBlocks,
} from "./slide-blocks.ts";
import { countMarpSlides, getLineForSlideIndex, getSlideIndexForLine } from "./slide-count.ts";

const deck = [
	"---",
	"marp: true",
	"---",
	"",
	"# One",
	"",
	"---",
	"",
	"# Two",
	"",
	"---",
	"",
	"# Three",
	"",
].join("\n");

test("splits front matter, bodies and dividers", () => {
	const { frontMatter, blocks, separators } = splitDeckIntoBlocks(deck);

	assert.equal(frontMatter, "---\nmarp: true\n---\n\n");
	assert.deepEqual(blocks, ["# One\n\n", "# Two\n\n", "# Three\n"]);
	assert.deepEqual(separators, ["---\n\n", "---\n\n"]);
});

test("round-trips an unmodified deck", () => {
	assert.equal(joinDeckBlocks(splitDeckIntoBlocks(deck)), deck);
});

test("treats a deck without front matter as one leading block", () => {
	const { frontMatter, blocks } = splitDeckIntoBlocks("# Only\n");

	assert.equal(frontMatter, "");
	assert.deepEqual(blocks, ["# Only\n"]);
});

test("ignores dividers inside fenced code", () => {
	const withFence = "# One\n\n```\n---\n```\n\n---\n\n# Two\n";
	const { blocks } = splitDeckIntoBlocks(withFence);

	assert.equal(blocks.length, 2);
	assert.ok(blocks[0].includes("```\n---\n```"));
});

test("moves the first slide to the end", () => {
	assert.equal(
		moveSlide(deck, 0, 2),
		[
			"---",
			"marp: true",
			"---",
			"",
			"# Two",
			"",
			"---",
			"",
			"# Three",
			"",
			"---",
			"",
			"# One",
			"",
			"",
		].join("\n"),
	);
});

test("moves the last slide to the front", () => {
	assert.equal(
		moveSlide(deck, 2, 0),
		[
			"---",
			"marp: true",
			"---",
			"",
			"# Three",
			"",
			"---",
			"",
			"# One",
			"",
			"---",
			"",
			"# Two",
			"",
			"",
		].join("\n"),
	);
});

test("keeps the front matter attached to the top of the deck", () => {
	assert.ok(moveSlide(deck, 0, 2).startsWith("---\nmarp: true\n---\n"));
});

test("keeps the slide count stable across a move", () => {
	assert.equal(countMarpSlides(moveSlide(deck, 2, 0)), countMarpSlides(deck));
});

test("inserts the blank line a divider needs so text stays a paragraph", () => {
	// Without the blank line, `---` below "Trailing text" would parse as a
	// setext H2 underline instead of a slide divider.
	const tight = "# One\n\n---\n\nTrailing text";
	const moved = moveSlide(tight, 1, 0);

	assert.equal(moved, "Trailing text\n\n---\n\n# One\n\n");
	assert.equal(countMarpSlides(moved), 2);
});

test("preserves the divider spelling in its original slot", () => {
	const mixed = "# One\n\n-----\n\n# Two\n\n---\n\n# Three\n";

	assert.equal(moveSlide(mixed, 0, 2), "# Two\n\n-----\n\n# Three\n\n---\n\n# One\n\n");
});

test("returns the input for no-op and out-of-range moves", () => {
	assert.equal(moveSlide(deck, 1, 1), deck);
	assert.equal(moveSlide(deck, -1, 0), deck);
	assert.equal(moveSlide(deck, 9, 0), deck);
	assert.equal(moveSlide("# Only\n", 0, 1), "# Only\n");
});

test("clamps an out-of-range target to the last slide", () => {
	assert.equal(moveSlide(deck, 0, 99), moveSlide(deck, 0, 2));
});

test("splices only the region that changed", () => {
	assert.deepEqual(computeMinimalSplice("abcdef", "abXYef"), {
		index: 2,
		deleteCount: 2,
		insert: "XY",
	});
	assert.deepEqual(computeMinimalSplice("abc", "abcdef"), {
		index: 3,
		deleteCount: 0,
		insert: "def",
	});
	assert.deepEqual(computeMinimalSplice("abcdef", "abc"), {
		index: 3,
		deleteCount: 3,
		insert: "",
	});
	assert.equal(computeMinimalSplice("same", "same"), null);
});

test("applying the splice reproduces the target text", () => {
	const next = moveSlide(deck, 0, 2);
	const splice = computeMinimalSplice(deck, next);

	assert.ok(splice);
	assert.equal(
		deck.slice(0, splice.index) + splice.insert + deck.slice(splice.index + splice.deleteCount),
		next,
	);
});

test("never splits a surrogate pair", () => {
	// Both strings share the high surrogate of a different emoji at the seam.
	const splice = computeMinimalSplice("a😀b", "a😃b");

	assert.ok(splice);
	assert.equal(
		"a😀b".slice(0, splice.index) + splice.insert + "a😀b".slice(splice.index + splice.deleteCount),
		"a😃b",
	);
	assert.equal(splice.index, 1);
	assert.equal(splice.deleteCount, 2);
});

test("slide-count helpers agree with the block split", () => {
	assert.equal(countMarpSlides(deck), 3);
	assert.equal(getSlideIndexForLine(deck, 5), 0);
	assert.equal(getSlideIndexForLine(deck, 9), 1);
	assert.equal(getSlideIndexForLine(deck, 13), 2);
	assert.equal(getLineForSlideIndex(deck, 0), 4);
	assert.equal(getLineForSlideIndex(deck, 1), 8);
	assert.equal(getLineForSlideIndex(deck, 2), 12);
});

test("slide-count handles decks without front matter or dividers", () => {
	assert.equal(countMarpSlides(""), 1);
	assert.equal(countMarpSlides("# Only"), 1);
	assert.equal(getLineForSlideIndex("# Only", 0), 1);
	assert.equal(getSlideIndexForLine("# Only", 1), 0);
});
