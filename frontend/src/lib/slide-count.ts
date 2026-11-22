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
	start: number;
	/** Exclusive end offset, including the line terminator if present. */
	end: number;
};

export function splitSourceLines(markdown: string): ScannedLine[] {
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
	start: number;
	/** Exclusive end offset, including the divider's line terminator. */
	end: number;
};

export type DeckScan = {
	lineCount: number;
	/** 0-based index of the first line after the YAML front matter. */
	contentLineIndex: number;
	contentOffset: number;
	dividers: DeckDivider[];
};

/** Scans hyphen dividers outside fenced code and leading YAML front matter. */
export function scanDeck(markdown: string): DeckScan {
	const lines = splitSourceLines(markdown);
	let contentLineIndex = 0;

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

/** Estimates slide count without rendering the deck. */
export function countMarpSlides(markdown: string): number {
	return scanDeck(markdown).dividers.length + 1;
}

/** Maps a one-based source line to a zero-based slide index. */
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

/** Maps a zero-based slide index to a one-based source line, clamped to the deck. */
export function getLineForSlideIndex(markdown: string, slideIndex: number): number {
	const { contentLineIndex, dividers, lineCount } = scanDeck(markdown);

	if (slideIndex <= 0) {
		return contentLineIndex + 1;
	}

	const divider = dividers[slideIndex - 1];

	return divider ? divider.lineIndex + 2 : lineCount;
}
