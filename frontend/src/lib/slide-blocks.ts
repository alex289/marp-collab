import { scanDeck } from "./slide-count.ts";

/**
 * A deck decomposed into the pieces that can be reordered independently.
 *
 * `content === blocks[0] + separators[0] + blocks[1] + separators[1] + ...`,
 * so `separators.length === blocks.length - 1`. Separators stay in their
 * positional slot when blocks move, which keeps each divider's original
 * spelling (`---` vs `-----`) where the author put it.
 */
export type DeckBlocks = {
	/** YAML front matter plus the blank lines under it; empty when absent. */
	frontMatter: string;
	/** Slide bodies in document order. Always holds at least one entry. */
	blocks: string[];
	/** Divider lines plus the blank lines under them. */
	separators: string[];
};

export type TextSplice = {
	index: number;
	deleteCount: number;
	insert: string;
};

/**
 * The blank lines under a divider are that divider's breathing room, not the
 * next slide's content. Attaching them to the separator keeps the spacing in
 * place when the blocks around it are reordered.
 */
function skipBlankLines(markdown: string, offset: number): number {
	const blankLines = /(?:[ \t]*(?:\r\n|\n|\r))*/y;
	blankLines.lastIndex = offset;

	return offset + (blankLines.exec(markdown)?.[0].length ?? 0);
}

/** Splits a deck into its front matter, slide bodies and dividers. */
export function splitDeckIntoBlocks(markdown: string): DeckBlocks {
	const { contentOffset, dividers } = scanDeck(markdown);
	const blocks: string[] = [];
	const separators: string[] = [];
	const start = skipBlankLines(markdown, contentOffset);
	let cursor = start;

	for (const divider of dividers) {
		blocks.push(markdown.slice(cursor, divider.start));
		cursor = skipBlankLines(markdown, divider.end);
		separators.push(markdown.slice(divider.start, cursor));
	}

	blocks.push(markdown.slice(cursor));

	return { frontMatter: markdown.slice(0, start), blocks, separators };
}

/**
 * A `---` directly below a non-empty line is a setext H2 underline, not a
 * thematic break, so a block that loses its trailing blank line would silently
 * swallow the following slide. Every block that precedes a divider therefore
 * ends with a blank line.
 */
function ensureBlankLineEnding(block: string): string {
	if (block.length === 0 || /(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)[ \t]*$/.test(block)) {
		return block;
	}

	const eol = block.includes("\r\n") ? "\r\n" : "\n";

	return /(?:\r\n|\n|\r)[ \t]*$/.test(block) ? block + eol : block + eol + eol;
}

/** Reassembles a deck, restoring the blank line each divider needs. */
export function joinDeckBlocks({ frontMatter, blocks, separators }: DeckBlocks): string {
	return blocks.reduce((markdown, block, index) => {
		const separator = separators[index];

		return separator === undefined
			? markdown + block
			: markdown + ensureBlankLineEnding(block) + separator;
	}, frontMatter);
}

/**
 * Moves the slide at `from` to position `to`, returning the new Markdown.
 * Returns the input unchanged when the move is a no-op or out of range.
 */
export function moveSlide(markdown: string, from: number, to: number): string {
	const deck = splitDeckIntoBlocks(markdown);
	const count = deck.blocks.length;

	if (count < 2 || from < 0 || from >= count) {
		return markdown;
	}

	const target = Math.min(Math.max(to, 0), count - 1);
	if (target === from) {
		return markdown;
	}

	const blocks = [...deck.blocks];
	blocks.splice(target, 0, ...blocks.splice(from, 1));

	return joinDeckBlocks({ ...deck, blocks });
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Describes `next` as a single splice of `current`, trimming the shared
 * prefix and suffix. Rewriting only the part that actually moved keeps
 * collaborators' cursors and the undo history intact, which a
 * delete-everything-then-reinsert would destroy.
 *
 * Returns `null` when the strings are equal.
 */
export function computeMinimalSplice(current: string, next: string): TextSplice | null {
	if (current === next) {
		return null;
	}

	const limit = Math.min(current.length, next.length);
	let start = 0;
	while (start < limit && current.charCodeAt(start) === next.charCodeAt(start)) {
		start += 1;
	}

	let suffix = 0;
	while (
		suffix < limit - start &&
		current.charCodeAt(current.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
	) {
		suffix += 1;
	}

	// Yjs indexes UTF-16 code units, so a boundary that lands between the two
	// halves of a surrogate pair would splice a broken character into the doc.
	if (start > 0 && isLowSurrogate(current.charCodeAt(start))) {
		start -= 1;
	}
	if (suffix > 0 && isLowSurrogate(current.charCodeAt(current.length - suffix))) {
		suffix -= 1;
	}

	return {
		index: start,
		deleteCount: current.length - start - suffix,
		insert: next.slice(start, next.length - suffix),
	};
}
