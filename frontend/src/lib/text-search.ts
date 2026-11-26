export {
	findTextMatches,
	getMatchPreviewSegments,
	isCurrentTextMatch,
	type MatchPreviewSegments,
	type TextSearchMatch,
	type TextSearchOptions,
} from "../../../shared/text-search.ts";
import { findTextMatches, type TextSearchMatch } from "../../../shared/text-search.ts";

export type ProjectSearchFileResult = {
	fileId: string;
	matches: TextSearchMatch[];
};

const MAX_ACTIVE_FILE_MATCHES = 100;

/**
 * Replaces the active file's entry in server search results with matches computed
 * directly from the local Yjs text, so unsynced keystrokes are reflected immediately.
 */
export function mergeActiveFileSearchResults(
	serverFiles: readonly ProjectSearchFileResult[],
	activeFileId: string | null,
	activeContent: string | null,
	query: string,
	caseSensitive: boolean,
): { files: ProjectSearchFileResult[]; totalMatches: number; activeFileTruncated: boolean } {
	if (!activeFileId || activeContent === null || query.length === 0) {
		const files = [...serverFiles];
		const totalMatches = files.reduce((sum, file) => sum + file.matches.length, 0);
		return { files, totalMatches, activeFileTruncated: false };
	}

	const activeMatches = findTextMatches(activeContent, query, {
		caseSensitive,
		maxMatches: MAX_ACTIVE_FILE_MATCHES + 1,
	});
	const activeFileTruncated = activeMatches.length > MAX_ACTIVE_FILE_MATCHES;
	if (activeFileTruncated) {
		activeMatches.length = MAX_ACTIVE_FILE_MATCHES;
	}

	const withoutActive = serverFiles.filter((file) => file.fileId !== activeFileId);
	const files =
		activeMatches.length > 0
			? [...withoutActive, { fileId: activeFileId, matches: activeMatches }].sort((left, right) =>
					left.fileId.localeCompare(right.fileId),
				)
			: withoutActive;
	const totalMatches = files.reduce((sum, file) => sum + file.matches.length, 0);
	return { files, totalMatches, activeFileTruncated };
}
