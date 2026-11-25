export type TextSearchMatch = {
	line: number;
	column: number;
	startOffset: number;
	endOffset: number;
	matchedText: string;
	linePreview: string;
	/** Zero-based offset of the match within `linePreview` (defaults to `column - 1`). */
	previewOffset?: number;
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

const MAX_LINE_PREVIEW_LENGTH = 240;
const MAX_LINE_PREVIEW_LEADING = 80;
const MAX_LINE_PREVIEW_TRAILING = 120;

function isLowSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function isHighSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function sliceSafeStart(value: string, start: number): string {
	let index = Math.max(0, start);
	if (index < value.length && isLowSurrogate(value.charCodeAt(index))) {
		index += 1;
	}
	return value.slice(index);
}

function sliceSafeEnd(value: string, end: number): string {
	let index = Math.min(value.length, end);
	if (index > 0 && isHighSurrogate(value.charCodeAt(index - 1))) {
		index -= 1;
	}
	return value.slice(0, index);
}

function buildLinePreview(
	lineText: string,
	columnIndex: number,
	matchLength: number,
): { linePreview: string; previewOffset: number } {
	if (lineText.length <= MAX_LINE_PREVIEW_LENGTH) {
		return { linePreview: lineText, previewOffset: columnIndex };
	}

	const matchEnd = Math.min(lineText.length, columnIndex + matchLength);
	const clipStart = Math.max(0, columnIndex - MAX_LINE_PREVIEW_LEADING);
	const clipEnd = Math.min(lineText.length, matchEnd + MAX_LINE_PREVIEW_TRAILING);

	const rawLeading =
		clipStart > 0
			? sliceSafeStart(lineText.slice(0, columnIndex), clipStart)
			: lineText.slice(0, columnIndex);
	const leading = clipStart > 0 ? `…${rawLeading}` : rawLeading;
	const matched = lineText.slice(columnIndex, matchEnd);
	const rawTrailing =
		clipEnd < lineText.length
			? sliceSafeEnd(lineText.slice(matchEnd), clipEnd - matchEnd)
			: lineText.slice(matchEnd);
	const trailing = clipEnd < lineText.length ? `${rawTrailing}…` : rawTrailing;

	return {
		linePreview: `${leading}${matched}${trailing}`,
		previewOffset: leading.length,
	};
}

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
		const columnIndex = startOffset - line.startOffset;
		const lineText = content.slice(line.startOffset, line.endOffset);
		const { linePreview, previewOffset } = buildLinePreview(
			lineText,
			columnIndex,
			matchedText.length,
		);
		matches.push({
			line: lineIndex + 1,
			column: columnIndex + 1,
			startOffset,
			endOffset: startOffset + matchedText.length,
			matchedText,
			linePreview,
			...(previewOffset !== columnIndex ? { previewOffset } : {}),
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
	match: Pick<TextSearchMatch, "column" | "matchedText" | "linePreview" | "previewOffset">,
	maxLeadingChars = 24,
): MatchPreviewSegments {
	const start = Math.max(0, match.previewOffset ?? match.column - 1);
	const end = Math.min(match.linePreview.length, start + match.matchedText.length);
	const rawBefore = match.linePreview.slice(0, start);
	const before =
		rawBefore.length > maxLeadingChars
			? `…${sliceSafeStart(rawBefore, rawBefore.length - maxLeadingChars)}`
			: rawBefore;
	return {
		before,
		match: match.linePreview.slice(start, end),
		after: match.linePreview.slice(end),
	};
}
