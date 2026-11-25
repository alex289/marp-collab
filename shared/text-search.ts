export type TextSearchMatch = {
	line: number;
	column: number;
	startOffset: number;
	endOffset: number;
	matchedText: string;
	linePreview: string;
};

export type TextSearchOptions = {
	caseSensitive?: boolean;
	maxMatches?: number;
};

export type MatchPreviewSegments = {
	before: string;
	match: string;
	after: string;
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
	content: string,
	query: string,
	options: TextSearchOptions = {},
): TextSearchMatch[] {
	if (query === "") {
		return [];
	}

	const { caseSensitive = false, maxMatches } = options;
	if (maxMatches !== undefined && maxMatches <= 0) {
		return [];
	}

	const matches: TextSearchMatch[] = [];
	const lines = getLineSpans(content);
	const flags = caseSensitive ? "gu" : "giu";
	const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
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

		if (maxMatches !== undefined && matches.length >= maxMatches) {
			break;
		}
	}

	return matches;
}

export function isCurrentTextMatch(
	content: string,
	match: Pick<TextSearchMatch, "startOffset" | "endOffset" | "matchedText">,
): boolean {
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

/** Splits a match's line preview into before/match/after segments, trimming long leading context. */
export function getMatchPreviewSegments(
	match: Pick<TextSearchMatch, "column" | "matchedText" | "linePreview">,
	maxLeadingChars = 24,
): MatchPreviewSegments {
	const start = Math.max(0, match.column - 1);
	const end = Math.min(match.linePreview.length, start + match.matchedText.length);
	const rawBefore = match.linePreview.slice(0, start);
	const before =
		rawBefore.length > maxLeadingChars ? `…${rawBefore.slice(-maxLeadingChars)}` : rawBefore;
	return {
		before,
		match: match.linePreview.slice(start, end),
		after: match.linePreview.slice(end),
	};
}
