import assert from "node:assert/strict";
import test from "node:test";
import { Marp } from "@marp-team/marp-core";
import * as Y from "yjs";
import {
	computeMinimalSplice,
	editSlideDeck,
	getEditableSlideDeck,
	getSlideNavigationLines,
	getSlideSections,
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

test("edits explicit Marp dividers while leaving Setext headings and notes in their slides", () => {
	const source = "First heading\n---\n\n<!--\n---\n-->\n\n* * *\n\n# Second";
	const parsed = getEditableSlideDeck(source, { startLines: [0, 7], frontMatterEnd: 0 });
	assert.ok(parsed);
	const edited = editSlideDeck(parsed, { type: "duplicate", index: 0 });
	assert.ok(edited);
	assert.equal(edited.slideCount, 3);
	assert.deepEqual(new Marp().render(edited.markdown).comments, [["---"], ["---"], []]);
	assert.ok(edited.markdown.includes("* * *"));
	assert.equal(getEditableSlideDeck(source, { startLines: [0, 9], frontMatterEnd: 0 }), null);
});

test("keeps section labels in source and moves the whole section", () => {
	const first = editSlideDeck(splitDeckIntoBlocks(deck), {
		type: "name-section",
		index: 0,
		name: 'Intro "quoted"',
	});
	assert.ok(first);
	const second = editSlideDeck(splitDeckIntoBlocks(first.markdown), {
		type: "name-section",
		index: 1,
		name: "Findings",
	});
	assert.ok(second);
	const moved = editSlideDeck(splitDeckIntoBlocks(second.markdown), {
		type: "move-section-up",
		index: 1,
	});
	assert.ok(moved);
	assert.deepEqual(getSlideSections(splitDeckIntoBlocks(moved.markdown)), [
		{ name: "Findings", start: 0, end: 2 },
		{ name: 'Intro "quoted"', start: 2, end: 3 },
	]);
	assert.match(moved.markdown, /# Two[\s\S]+# Three[\s\S]+# One/);
	const rendered = new Marp().render(moved.markdown);
	assert.deepEqual(rendered.comments, [[], [], []]);
	assert.doesNotMatch(rendered.html, /Findings|quoted/);
});

test("retains a section after deleting its opening slide and keeps deck directives after deleting all slides", () => {
	const preamble = "<!-- theme: gaia -->\n\n";
	const marker = '[marp-collab-section]: # "Opening"\n\n';
	const source = preamble + marker + "# One\n\n---\n\n# Two";
	const parsed = splitDeckIntoBlocks(source);
	const reduced = editSlideDeck(parsed, { type: "delete", indices: [0] });
	assert.equal(reduced?.markdown, preamble + marker + "# Two");
	const empty = editSlideDeck(parsed, { type: "delete", indices: [0, 1] });
	assert.equal(empty?.markdown, preamble);
	assert.equal(
		editSlideDeck(splitDeckIntoBlocks(preamble), { type: "add", index: 0 })?.markdown,
		preamble + "# New slide\n",
	);
});

test("keeps an empty opening slide from consuming the next slide as YAML", () => {
	const moved = moveSlide("# One\n\n---\n\n# Two\n\n---", 2, 0);
	assert.deepEqual(new Marp().render(moved).comments, [[], [], []]);
	assert.ok(moved.startsWith("\n---\n"));
});

test("can jump to a blank last slide after a divider at the end of the file", () => {
	const source = "# One\r\n\r\n---";
	assert.deepEqual(
		getSlideNavigationLines(source, { startLines: [0, 2], frontMatterEnd: 0 }),
		[1, 3],
	);
});

test("keeps leading mixed deck defaults while deleting the first slide", () => {
	const defaults = "<!--\ntheme: gaia\npaginate: true\n-->\n\n";
	const source = defaults + "<!-- _class: lead -->\n\n# One\n\n---\n\n# Two";
	const result = editSlideDeck(splitDeckIntoBlocks(source), { type: "delete", indices: [0] });
	assert.equal(result?.markdown, defaults + "# Two");
});

test("bulk deletion and moves retain concurrent edits inside an untouched slide", () => {
	for (const type of ["delete", "move"] as const) {
		const left = new Y.Doc();
		const right = new Y.Doc();
		const source = "# One\n\n---\n\n# Two retained text\n\n---\n\n# Three";
		const content = left.getText("content");
		content.insert(0, source);
		Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
		const shared = Y.encodeStateVector(right);

		const action =
			type === "delete" ? { type, indices: [0, 2] } : { type, indices: [0, 2], slot: 3 };
		const edit = editSlideDeck(splitDeckIntoBlocks(source), action);
		assert.ok(edit);
		left.transact(() => {
			for (const { index, deleteCount, insert } of [...edit.splices].reverse()) {
				content.delete(index, deleteCount);
				content.insert(index, insert);
			}
		});
		assert.equal(content.toJSON(), edit.markdown);

		right.getText("content").insert(source.indexOf("retained"), "concurrent ");
		Y.applyUpdate(left, Y.encodeStateAsUpdate(right, shared));
		assert.equal(content.toJSON(), edit.markdown.replace("retained", "concurrent retained"));
		left.destroy();
		right.destroy();
	}
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
