// Tracks fenced code blocks so slide dividers inside code are ignored.
type Fence = {
	marker: "`" | "~";
	length: number;
};

function getFence(line: string): Fence | null {
	const match = line.match(/^\s*(`{3,}|~{3,})/);

	if (!match) {
		return null;
	}

	const sequence = match[1];

	return {
		marker: sequence[0] as Fence["marker"],
		length: sequence.length,
	};
}

function closesFence(line: string, fence: Fence): boolean {
	const match = line.match(/^\s*(`{3,}|~{3,})([ \t]*)$/);

	if (!match) {
		return false;
	}

	const sequence = match[1];

	return sequence[0] === fence.marker && sequence.length >= fence.length;
}

const isDivider = (line: string) => /^\s*-{3,}\s*$/.test(line);

type ScannedLine = {
	text: string;
	/** Character offset of the first character of the line. */
	start: number;
	/** Character offset just past the line's terminator (end of input for the last line). */
	end: number;
};

/** Splits on the same terminators as `String.split(/\r\n|\n|\r/)`, keeping offsets. */
function splitLines(markdown: string): ScannedLine[] {
	const lines: ScannedLine[] = [];
	const terminator = /\r\n|\n|\r/g;
	let start = 0;
	let match = terminator.exec(markdown);

	while (match) {
		lines.push({ text: markdown.slice(start, match.index), start, end: terminator.lastIndex });
		start = terminator.lastIndex;
		match = terminator.exec(markdown);
	}

	lines.push({ text: markdown.slice(start), start, end: markdown.length });

	return lines;
}

export type DeckDivider = {
	/** 0-based index of the divider line. */
	lineIndex: number;
	/** Offset of the first character of the divider line. */
	start: number;
	/** Offset just past the divider's line terminator. */
	end: number;
};

export type DeckScan = {
	lineCount: number;
	/** 0-based index of the first line after the YAML front matter. */
	contentLineIndex: number;
	/** Character offset of the first line after the YAML front matter. */
	contentOffset: number;
	dividers: DeckDivider[];
};

/**
 * Single pass over the Markdown that locates the slide dividers — the `---`
 * lines outside code fences and outside the leading YAML front matter. Every
 * other slide helper is derived from this so they can never disagree.
 */
export function scanDeck(markdown: string): DeckScan {
	const lines = splitLines(markdown);
	let contentLineIndex = 0;

	// YAML front matter is delimited by `---` (closed by `---` or `...`) at
	// the very start of the document; those lines are not slide dividers.
	if (lines[0]?.text.trim() === "---") {
		for (let index = 1; index < lines.length; index += 1) {
			const trimmed = lines[index].text.trim();

			if (trimmed === "---" || trimmed === "...") {
				contentLineIndex = index + 1;
				break;
			}
		}
	}

	const dividers: DeckDivider[] = [];
	let fence: Fence | null = null;

	for (let index = contentLineIndex; index < lines.length; index += 1) {
		const line = lines[index];

		if (fence) {
			if (closesFence(line.text, fence)) {
				fence = null;
			}
			continue;
		}

		const nextFence = getFence(line.text);
		if (nextFence) {
			fence = nextFence;
			continue;
		}

		if (isDivider(line.text)) {
			dividers.push({ lineIndex: index, start: line.start, end: line.end });
		}
	}

	return {
		lineCount: lines.length,
		contentLineIndex,
		contentOffset: lines[contentLineIndex]?.start ?? markdown.length,
		dividers,
	};
}

/**
 * Counts Marp slides directly from the Markdown source, by counting `---`
 * dividers outside of code fences (Marp's own frontmatter delimiters are
 * skipped, not counted as dividers). Slide count is `dividers + 1`.
 */
export function countMarpSlides(markdown: string): number {
	return scanDeck(markdown).dividers.length + 1;
}

/**
 * Returns the 0-based index of the slide containing the given 1-based line
 * number, using the same divider/fence/front-matter rules as
 * `countMarpSlides`.
 */
export function getSlideIndexForLine(markdown: string, line: number): number {
	const targetIndex = Math.max(0, line - 1);
	const { dividers } = scanDeck(markdown);
	let slideIndex = 0;

	for (const divider of dividers) {
		if (divider.lineIndex >= targetIndex) {
			break;
		}

		slideIndex += 1;
	}

	return slideIndex;
}

/**
 * Returns the 1-based line number where the given 0-based slide index
 * starts, using the same divider/fence/front-matter rules as
 * `countMarpSlides`. Out-of-range indexes fall back to the closest bound.
 */
export function getLineForSlideIndex(markdown: string, slideIndex: number): number {
	const { contentLineIndex, dividers, lineCount } = scanDeck(markdown);

	if (slideIndex <= 0) {
		return contentLineIndex + 1;
	}

	const divider = dividers[slideIndex - 1];

	return divider ? divider.lineIndex + 2 : lineCount;
}
