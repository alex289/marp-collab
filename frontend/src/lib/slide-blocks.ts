import { scanDeck, splitSourceLines, type DeckDivider } from "./slide-count.ts";

/**
 * A deck decomposed into the pieces that can be reordered independently.
 *
 * `content === blocks[0] + separators[0] + blocks[1] + separators[1] + ...`,
 * so `separators.length === blocks.length - 1`. Separators stay in their
 * positional slot when blocks move, which keeps each divider's original
 * spelling (`---` vs `-----`) where the author put it.
 */
export type DeckBlocks = {
	/** YAML front matter, leading deck-wide directives, and their surrounding whitespace. */
	frontMatter: string;
	/** Slide bodies in document order. Always holds at least one entry. */
	blocks: string[];
	/** Divider lines plus the blank lines under them. */
	separators: string[];
};

export type SlideSection = { name: string | null; start: number; end: number };
export type SlideSource = { startLines: number[]; frontMatterEnd: number };
export type SlideEdit = {
	markdown: string;
	index: number;
	slideCount: number;
	splices: TextSplice[];
};

export type SlideAction =
	| { type: "add" | "duplicate"; index: number }
	| { type: "delete"; indices: number[] }
	| { type: "move"; indices: number[]; slot: number }
	| { type: "name-section"; index: number; name: string }
	| { type: "remove-section" | "move-section-up" | "move-section-down"; index: number };

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

const eolPattern = /\r\n|\n|\r/;
const sourceEol = (source: string) => eolPattern.exec(source)?.[0] ?? "\n";
const explicitDivider = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const leadingComment = /<!--([\s\S]*?)-->[ \t]*(?:\r\n|\n|\r|$)/y;
const globalDirective =
	/^(?:marp|theme|size|style|lang|math|headingDivider|tailwind|title|description|author|keywords|url|image|html):/;
const stickyDirective =
	/^(?:backgroundColor|backgroundImage|backgroundPosition|backgroundRepeat|backgroundSize|class|color|footer|header|paginate):/;

function splitBlocks(markdown: string, contentOffset: number, dividers: DeckDivider[]): DeckBlocks {
	const blocks: string[] = [];
	const separators: string[] = [];
	let start = skipBlankLines(markdown, contentOffset);

	// Leading deck-wide settings may include defaults for the whole deck.
	// A comment with a spot directive belongs to its slide.
	while (start < (dividers[0]?.start ?? markdown.length)) {
		leadingComment.lastIndex = start;
		const match = leadingComment.exec(markdown);
		if (!match) {
			break;
		}
		const lines = match[1].split(eolPattern).filter((line) => line.trim());
		const indent = lines[0]?.match(/^[ \t]*/)?.[0].length ?? 0;
		const keys = lines
			.filter((line) => line.length - line.trimStart().length <= indent)
			.map((line) => line.trimStart().match(/^[\w-]+:/)?.[0] ?? "");
		if (
			!keys.some((key) => globalDirective.test(key)) ||
			!keys.every((key) => globalDirective.test(key) || stickyDirective.test(key))
		) {
			break;
		}
		start = skipBlankLines(markdown, leadingComment.lastIndex);
	}
	let cursor = start;

	for (const divider of dividers) {
		blocks.push(markdown.slice(cursor, divider.start));
		cursor = skipBlankLines(markdown, divider.end);
		separators.push(markdown.slice(divider.start, cursor));
	}

	blocks.push(markdown.slice(cursor));

	return { frontMatter: markdown.slice(0, start), blocks, separators };
}

/** Splits a deck into its front matter, slide bodies and dividers. */
export function splitDeckIntoBlocks(markdown: string): DeckBlocks {
	const { contentOffset, dividers } = scanDeck(markdown);
	return splitBlocks(markdown, contentOffset, dividers);
}

/**
 * Uses the rendered slide boundaries so fenced code, Setext headings and
 * comments cannot be mistaken for dividers. Implicit heading breaks have no
 * separator to edit and are left to the source editor.
 */
export function getEditableSlideDeck(
	markdown: string,
	{ startLines, frontMatterEnd }: SlideSource,
): DeckBlocks | null {
	if (startLines.length === 0) {
		return null;
	}

	const lines = splitSourceLines(markdown);
	const contentOffset = lines[frontMatterEnd]?.start ?? markdown.length;
	const dividers: DeckDivider[] = [];
	for (const lineIndex of startLines.slice(1)) {
		const line = lines[lineIndex];
		if (!line || line.start < contentOffset || !explicitDivider.test(line.text)) {
			return null;
		}
		dividers.push({ lineIndex, start: line.start, end: line.end });
	}
	return splitBlocks(markdown, contentOffset, dividers);
}

/** Returns the editor line to jump to for each rendered thumbnail. */
export function getSlideNavigationLines(markdown: string, source: SlideSource): number[] {
	const lines = splitSourceLines(markdown);
	return source.startLines.map((line, index) =>
		Math.min(
			lines.length,
			index === 0
				? source.frontMatterEnd + 1
				: line + (explicitDivider.test(lines[line]?.text ?? "") ? 2 : 1),
		),
	);
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

	const eol = sourceEol(block);

	return /(?:\r\n|\n|\r)[ \t]*$/.test(block) ? block + eol : block + eol + eol;
}

/** Reassembles a deck, restoring the blank line each divider needs. */
function assembleDeck({ frontMatter, blocks, separators }: DeckBlocks, normalize: boolean) {
	const eol = sourceEol(frontMatter || separators[0] || blocks[0] || "");
	// An empty opening slide must not turn its divider into a YAML opener.
	const emptyOpeningSlide = !frontMatter && blocks[0] === "" && separators[0]?.trim() === "---";
	let markdown = frontMatter;
	if (normalize) {
		if (frontMatter && !eolPattern.test(frontMatter.at(-1) ?? "") && (blocks[0] || separators[0])) {
			markdown += eol + eol;
		} else if (emptyOpeningSlide) {
			markdown = eol;
		}
	}

	const starts = blocks.map((block, index) => {
		const start = markdown.length;
		const separator = separators[index];
		if (separator === undefined || !normalize) {
			markdown += block + (separator ?? "");
		} else {
			const endsDeck = index === blocks.length - 2 && blocks[index + 1] === "";
			const afterSeparator = endsDeck || eolPattern.test(separator) ? "" : eol;
			markdown += ensureBlankLineEnding(block) + separator + afterSeparator;
		}
		return start;
	});
	return { markdown, starts };
}

export function joinDeckBlocks(deck: DeckBlocks): string {
	return assembleDeck(deck, true).markdown;
}

/**
 * Keep the Yjs identities of stationary slides, even when an edit touches both
 * sides of one. The splices use original offsets and apply in reverse order.
 */
function computeSlideSplices(current: DeckBlocks, next: DeckBlocks, origins: Array<number | null>) {
	const before = assembleDeck(current, false);
	const after = assembleDeck(next, true);
	const splices: TextSplice[] = [];
	let beforeStart = 0;
	let afterStart = 0;

	function compareUntil(beforeEnd: number, afterEnd: number) {
		const splice = computeMinimalSplice(
			before.markdown.slice(beforeStart, beforeEnd),
			after.markdown.slice(afterStart, afterEnd),
		);
		if (splice) {
			splices.push({ ...splice, index: beforeStart + splice.index });
		}
		beforeStart = beforeEnd;
		afterStart = afterEnd;
	}

	for (const [index, origin] of origins.entries()) {
		if (origin === null || !current.blocks[origin]) {
			continue;
		}
		compareUntil(before.starts[origin], after.starts[index]);
		compareUntil(
			before.starts[origin] + current.blocks[origin].length,
			after.starts[index] + next.blocks[index].length,
		);
	}
	compareUntil(before.markdown.length, after.markdown.length);
	return { markdown: after.markdown, splices };
}

// Like `presenter:`, a section label is an HTML comment at the top of its
// first slide that MarpCollab keeps out of the presenter notes.
const sectionMarker = /^<!--[ \t]*section[ \t]*:[ \t]*([^\r\n]*?)[ \t]*-->[ \t]*(?:\r\n|\n|\r|$)/i;

function readSectionMarker(block: string) {
	const match = sectionMarker.exec(block);
	if (!match) {
		return null;
	}

	// An empty marker starts no section but is still replaced when naming one.
	return { name: match[1].trim(), end: skipBlankLines(block, match[0].length) };
}

export function getSlideSections({ blocks }: DeckBlocks): SlideSection[] {
	const sections: SlideSection[] = [];
	let section: SlideSection = { name: null, start: 0, end: blocks.length };
	for (const [index, block] of blocks.entries()) {
		const marker = readSectionMarker(block);
		if (!marker?.name) {
			continue;
		}
		if (index > section.start) {
			sections.push({ ...section, end: index });
		}
		section = { name: marker.name, start: index, end: blocks.length };
	}
	sections.push(section);
	return sections;
}

const htmlComment = /<!--([\s\S]*?)-->/g;

/**
 * Local directives without an underscore carry over to every later slide, so
 * moving or deleting the slide that sets one restyles the rest of the deck.
 */
function setsInheritedDirective(block: string) {
	return Array.from(block.matchAll(htmlComment), (match) => match[1]).some((comment) =>
		comment.split(eolPattern).some((line) => stickyDirective.test(line.trim())),
	);
}

/** The slides whose inherited directives an action would move or remove. */
export function getInheritedDirectiveConflict(deck: DeckBlocks, action: SlideAction) {
	let affected: number[] = [];
	if (action.type === "delete" || action.type === "move") {
		affected = action.indices;
	} else if (action.type === "move-section-up" || action.type === "move-section-down") {
		const sections = getSlideSections(deck);
		const position = sections.findIndex(({ start }) => start === action.index);
		const neighbor = sections[position + (action.type === "move-section-up" ? -1 : 1)];
		for (const section of [sections[position], neighbor]) {
			for (let index = section?.start ?? 0; index < (section?.end ?? 0); index += 1) {
				affected.push(index);
			}
		}
	}
	return affected.some((index) => setsInheritedDirective(deck.blocks[index] ?? ""));
}

/** A slot is before the slide at that index, or after the deck at slideCount. */
export function getSlideMoveTarget(
	slideCount: number,
	indices: number[],
	slot: number,
): number | null {
	if (!Number.isInteger(slot) || indices.length === 0 || slot < 0 || slot > slideCount) {
		return null;
	}
	const target = slot - indices.filter((index) => index < slot).length;
	return indices.every((index, position) => index === target + position) ? null : target;
}

export function editSlideDeck(deck: DeckBlocks, action: SlideAction): SlideEdit | null {
	const { frontMatter, blocks, separators } = deck;
	const count = blocks.length;
	const eol = sourceEol(frontMatter + (blocks[0] ?? "") + (separators[0] ?? ""));
	const withoutMarker = (body: string) => body.slice(readSectionMarker(body)?.end ?? 0);
	const withMarker = (body: string, name: string) => `<!-- section: ${name} -->${eol}${eol}${body}`;
	const sections = getSlideSections(deck);
	const origins = blocks.map((_, index): number | null => index);

	function result(
		bodies: string[],
		index: number,
		dividers = separators,
		stationary = origins,
	): SlideEdit {
		return {
			...computeSlideSplices(
				deck,
				{ frontMatter, blocks: bodies, separators: dividers },
				stationary,
			),
			index,
			slideCount: bodies.length,
		};
	}

	if ("indices" in action) {
		const selected = new Set(action.indices);
		const rows = sections.flatMap((section) =>
			blocks.slice(section.start, section.end).map((block, offset) => ({
				body: offset === 0 ? withoutMarker(block) : block,
				index: section.start + offset,
				section,
			})),
		);
		const moving = rows.filter((row) => selected.has(row.index));
		if (!moving.length || moving.length !== selected.size) {
			return null;
		}
		const remaining = rows.filter((row) => !selected.has(row.index));
		const assemble = () =>
			remaining.map((row, position) =>
				row.section.name && row.section !== remaining[position - 1]?.section
					? blocks[row.section.start].slice(
							0,
							readSectionMarker(blocks[row.section.start])?.end ?? 0,
						) + row.body
					: row.body,
			);

		if (action.type === "delete") {
			if (!remaining.length) {
				return result([""], 0, [], [null]);
			}
			return result(
				assemble(),
				Math.min(moving[0].index, remaining.length - 1),
				remaining.slice(1).map(({ index }) => separators[index - 1]),
				remaining.map(({ index }) => index),
			);
		}
		const target = getSlideMoveTarget(
			count,
			moving.map(({ index }) => index),
			action.slot,
		);
		if (target === null) {
			return null;
		}

		// Moved slides join the section of the neighbour they pass, so a slide
		// reaches the end of its section before it crosses into the next one.
		const neighbor = target > moving[0].index ? remaining[target - 1] : remaining[target];
		const destination = (neighbor ?? remaining.at(-1))?.section;
		if (!destination) {
			return null;
		}
		remaining.splice(target, 0, ...moving.map((row) => ({ ...row, section: destination })));
		return result(
			assemble(),
			target,
			separators,
			remaining.map(({ index }) => (selected.has(index) ? null : index)),
		);
	}

	const { index } = action;
	const block = blocks[index];
	if (block === undefined) {
		return null;
	}
	const next = [...blocks];

	switch (action.type) {
		case "add":
		case "duplicate": {
			const body = action.type === "add" ? `# New slide${eol}` : withoutMarker(block);
			if (action.type === "add" && count === 1 && !withoutMarker(block).trim()) {
				next[0] = block.slice(0, readSectionMarker(block)?.end ?? 0) + body;
				return result(next, 0);
			}
			next.splice(index + 1, 0, body);
			origins.splice(index + 1, 0, null);
			const dividers = [...separators];
			dividers.splice(index, 0, `---${eol}${eol}`);
			return result(next, index + 1, dividers);
		}
		case "name-section": {
			// The name can't end the comment that holds it.
			const name = action.name.trim().replace(/-{2,}>/g, "->");
			if (!name || /[\r\n]/.test(name)) {
				return null;
			}
			if (readSectionMarker(block)?.name === name) {
				return null;
			}
			next[index] = withMarker(withoutMarker(block), name);
			return result(next, index);
		}
		case "remove-section":
			if (!readSectionMarker(block)) {
				return null;
			}
			next[index] = withoutMarker(block);
			return result(next, index);
		case "move-section-up":
		case "move-section-down": {
			const position = sections.findIndex((section) => section.start === index && section.name);
			const direction = action.type === "move-section-up" ? -1 : 1;
			const neighbor = sections[position + direction];
			if (position < 0 || !neighbor?.name) {
				return null;
			}

			const first = sections[Math.min(position, position + direction)];
			const second = sections[Math.max(position, position + direction)];
			const swapped = [
				...blocks.slice(second.start, second.end),
				...blocks.slice(first.start, first.end),
			];
			next.splice(first.start, swapped.length, ...swapped);
			const newIndex = direction < 0 ? first.start : first.start + second.end - second.start;
			const movedCount = sections[position].end - sections[position].start;
			origins.splice(index, movedCount);
			origins.splice(newIndex, 0, ...Array<number | null>(movedCount).fill(null));
			return result(next, newIndex);
		}
	}
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

	return (
		editSlideDeck(deck, {
			type: "move",
			indices: [from],
			slot: target > from ? target + 1 : target,
		})?.markdown ?? markdown
	);
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
