export type TextSearchMatch = {
	fileId: string;
	line: number;
	column: number;
	startOffset: number;
	endOffset: number;
	matchedText: string;
	linePreview: string;
	source: "active" | "backend";
};

type LineSpan = {
	startOffset: number;
	endOffset: number;
};

function getLineSpans(content: string): LineSpan[] {
	const lines: LineSpan[] = [];
	let lineStart = 0;
	let offset = 0;

	while (offset < content.length) {
		const char = content[offset];

		if (char === "\r" || char === "\n") {
			lines.push({ startOffset: lineStart, endOffset: offset });

			if (char === "\r" && content[offset + 1] === "\n") {
				offset += 2;
			} else {
				offset += 1;
			}

			lineStart = offset;
			continue;
		}

		offset += 1;
	}

	lines.push({ startOffset: lineStart, endOffset: content.length });
	return lines;
}

export function findTextMatches(
	fileId: string,
	content: string,
	query: string,
	source: TextSearchMatch["source"],
): TextSearchMatch[] {
	if (query === "") {
		return [];
	}

	const matches: TextSearchMatch[] = [];
	const lines = getLineSpans(content);
	let searchOffset = 0;
	let lineIndex = 0;

	while (searchOffset <= content.length) {
		const startOffset = content.indexOf(query, searchOffset);

		if (startOffset === -1) {
			break;
		}

		while (lineIndex < lines.length - 1 && startOffset >= lines[lineIndex + 1].startOffset) {
			lineIndex += 1;
		}

		const line = lines[lineIndex];
		const endOffset = startOffset + query.length;

		matches.push({
			fileId,
			line: lineIndex + 1,
			column: startOffset - line.startOffset + 1,
			startOffset,
			endOffset,
			matchedText: content.slice(startOffset, endOffset),
			linePreview: content.slice(line.startOffset, line.endOffset),
			source,
		});

		searchOffset = endOffset;
	}

	return matches;
}

export function replaceTextRange(
	content: string,
	match: { startOffset: number; endOffset: number; expectedText: string },
	replacement: string,
): { status: "replaced" | "stale"; content: string } {
	const { startOffset, endOffset, expectedText } = match;
	const hasValidOffsets =
		Number.isInteger(startOffset) &&
		Number.isInteger(endOffset) &&
		startOffset >= 0 &&
		endOffset >= startOffset &&
		endOffset <= content.length;

	if (
		!hasValidOffsets ||
		expectedText.length === 0 ||
		endOffset - startOffset !== expectedText.length ||
		content.slice(startOffset, endOffset) !== expectedText
	) {
		return { status: "stale", content };
	}

	return {
		status: "replaced",
		content: content.slice(0, startOffset) + replacement + content.slice(endOffset),
	};
}
