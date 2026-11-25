export type TextSearchMatch = {
	line: number;
	column: number;
	startOffset: number;
	endOffset: number;
	matchedText: string;
	linePreview: string;
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

export function findTextMatches(content: string, query: string): TextSearchMatch[] {
	if (query === "") {
		return [];
	}

	const matches: TextSearchMatch[] = [];
	const lines = getLineSpans(content);
	const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
	let lineIndex = 0;

	for (const { 0: matchedText, index: startOffset } of content.matchAll(pattern)) {
		while (lineIndex < lines.length - 1 && startOffset >= lines[lineIndex + 1].startOffset) {
			lineIndex += 1;
		}

		const line = lines[lineIndex];
		matches.push({
			line: lineIndex + 1,
			column: startOffset - line.startOffset + 1,
			startOffset,
			endOffset: startOffset + matchedText.length,
			matchedText,
			linePreview: content.slice(line.startOffset, line.endOffset),
		});
	}

	return matches;
}

export function isCurrentTextMatch(content: string, match: TextSearchMatch): boolean {
	const { startOffset, endOffset, matchedText } = match;
	return (
		Number.isInteger(startOffset) &&
		Number.isInteger(endOffset) &&
		startOffset >= 0 &&
		endOffset <= content.length &&
		endOffset - startOffset === matchedText.length &&
		matchedText.length > 0 &&
		content.slice(startOffset, endOffset) === matchedText
	);
}
