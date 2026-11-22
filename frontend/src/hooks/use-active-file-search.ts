import { useState } from "react";
import type { Text } from "yjs";
import { findTextMatches, isCurrentTextMatch, type TextSearchMatch } from "@/lib/text-search";

type SearchResult = { query: string; matches: TextSearchMatch[]; error: string | null };
const emptyResult: SearchResult = { query: "", matches: [], error: null };

function replaceMatch(text: Text, match: TextSearchMatch, replacement: string): void {
	text.delete(match.startOffset, match.endOffset - match.startOffset);
	text.insert(match.startOffset, replacement);
}

export function useActiveFileSearch(fileId: string | null, text: Text | null, readOnly: boolean) {
	const [searchFileId, setSearchFileId] = useState(fileId);
	const [result, setResult] = useState(emptyResult);
	if (fileId !== searchFileId) {
		setSearchFileId(fileId);
		setResult(emptyResult);
	}

	function onSearch(query: string): void {
		if (query.length === 0) {
			setResult(emptyResult);
			return;
		}
		setResult(
			text
				? { query, matches: findTextMatches(text.toJSON(), query), error: null }
				: { query, matches: [], error: "Open an editable file to search." },
		);
	}

	function onReplaceOne(match: TextSearchMatch, replacement: string): void {
		if (readOnly || !text?.doc || !isCurrentTextMatch(text.toJSON(), match)) {
			setResult({ ...result, error: "Result changed. Search again." });
			return;
		}
		text.doc.transact(() => replaceMatch(text, match, replacement));
		onSearch(result.query);
	}

	function onReplaceAll(query: string, replacement: string): void {
		if (readOnly || !text?.doc || query.length === 0) {
			setResult({ query, matches: [], error: "Open an editable file to replace." });
			return;
		}
		const matches = findTextMatches(text.toJSON(), query);
		text.doc.transact(() => {
			for (const match of matches.reverse()) {
				replaceMatch(text, match, replacement);
			}
		});
		onSearch(query);
	}

	return {
		fileId,
		matches: result.matches,
		error: result.error,
		readOnly: readOnly || !text,
		onSearch,
		onReplaceOne,
		onReplaceAll,
	};
}
