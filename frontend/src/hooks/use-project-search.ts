import { useCallback, useEffect, useRef, useState } from "react";
import type { Text } from "yjs";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import {
	findTextMatches,
	isCurrentTextMatch,
	mergeActiveFileSearchResults,
	type ProjectSearchFileResult,
	type TextSearchMatch,
} from "@/lib/text-search";

type SearchState = {
	query: string;
	caseSensitive: boolean;
	files: ProjectSearchFileResult[];
	totalMatches: number;
	truncated: boolean;
	skippedFiles: string[];
	error: string | null;
};

const emptyState: SearchState = {
	query: "",
	caseSensitive: false,
	files: [],
	totalMatches: 0,
	truncated: false,
	skippedFiles: [],
	error: null,
};

type ProjectSearchResponse = {
	query: string;
	caseSensitive: boolean;
	files: ProjectSearchFileResult[];
	totalMatches: number;
	truncated: boolean;
	skippedFiles?: string[];
	error?: string;
};

type ProjectReplaceResponse = {
	replacedMatches: number;
	updatedFiles?: string[];
	fileId?: string;
	error?: string;
};

async function readJsonPayload<T extends { error?: string }>(
	response: Response,
): Promise<T | null> {
	try {
		return (await response.json()) as T;
	} catch {
		return null;
	}
}

function replaceMatchInYText(text: Text, match: TextSearchMatch, replacement: string): void {
	text.delete(match.startOffset, match.endOffset - match.startOffset);
	text.insert(match.startOffset, replacement);
}

type UseProjectSearchOptions = {
	projectId: string;
	activeFileId: string | null;
	activeYText: Text | null;
	readOnly: boolean;
	onSelectMatch: (fileId: string, match: TextSearchMatch) => void;
};

export function useProjectSearch({
	projectId,
	activeFileId,
	activeYText,
	readOnly,
	onSelectMatch,
}: UseProjectSearchOptions) {
	const [searchProjectId, setSearchProjectId] = useState(projectId);
	const [state, setState] = useState<SearchState>(emptyState);
	const [isSearching, setIsSearching] = useState(false);
	const [isReplacing, setIsReplacing] = useState(false);
	const searchRequestRef = useRef(0);
	const abortRef = useRef<AbortController | null>(null);
	const activeFileRef = useRef({ activeFileId, activeYText });

	useEffect(() => {
		activeFileRef.current = { activeFileId, activeYText };
	}, [activeFileId, activeYText]);

	if (projectId !== searchProjectId) {
		setSearchProjectId(projectId);
		setState(emptyState);
		setIsSearching(false);
		setIsReplacing(false);
	}

	useEffect(() => {
		return () => {
			searchRequestRef.current += 1;
			abortRef.current?.abort();
		};
	}, [projectId]);

	const runSearch = useCallback(
		async (
			query: string,
			caseSensitive: boolean,
			options?: { skipLocalActiveFileMerge?: boolean },
		): Promise<void> => {
			abortRef.current?.abort();

			if (query.length === 0) {
				searchRequestRef.current += 1;
				setState({ ...emptyState, caseSensitive });
				setIsSearching(false);
				return;
			}

			const requestId = ++searchRequestRef.current;
			const controller = new AbortController();
			abortRef.current = controller;
			setIsSearching(true);
			setState((previous) => ({ ...previous, query, caseSensitive, error: null }));

			try {
				const response = await fetch(`${API_URL}/projects/${projectId}/search`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query, caseSensitive }),
					signal: controller.signal,
				});
				const payload = await readJsonPayload<ProjectSearchResponse>(response);
				if (searchRequestRef.current !== requestId) {
					return;
				}
				if (!response.ok || !payload) {
					setState({
						query,
						caseSensitive,
						files: [],
						totalMatches: 0,
						truncated: false,
						skippedFiles: [],
						error: payload?.error ?? `Search failed (${response.status}).`,
					});
					return;
				}

				if (options?.skipLocalActiveFileMerge) {
					setState({
						query,
						caseSensitive,
						files: payload.files,
						totalMatches: payload.totalMatches,
						truncated: payload.truncated,
						skippedFiles: payload.skippedFiles ?? [],
						error: null,
					});
					return;
				}

				const { activeFileId: currentFileId, activeYText: currentYText } = activeFileRef.current;
				const merged = mergeActiveFileSearchResults(
					payload.files,
					currentFileId,
					currentYText ? currentYText.toJSON() : null,
					query,
					caseSensitive,
				);
				setState({
					query,
					caseSensitive,
					files: merged.files,
					totalMatches: merged.totalMatches,
					truncated: payload.truncated || merged.activeFileTruncated,
					skippedFiles: payload.skippedFiles ?? [],
					error: null,
				});
			} catch (error) {
				if (controller.signal.aborted || searchRequestRef.current !== requestId) {
					return;
				}
				setState({
					query,
					caseSensitive,
					files: [],
					totalMatches: 0,
					truncated: false,
					skippedFiles: [],
					error: error instanceof Error ? error.message : "Search failed.",
				});
			} finally {
				if (searchRequestRef.current === requestId) {
					setIsSearching(false);
				}
			}
		},
		[projectId],
	);

	const onSearch = useCallback(
		(query: string, caseSensitive = state.caseSensitive) => {
			void runSearch(query, caseSensitive);
		},
		[runSearch, state.caseSensitive],
	);

	const onReplaceOne = useCallback(
		async (fileId: string, match: TextSearchMatch, replacement: string) => {
			if (readOnly || isReplacing) {
				return;
			}

			const { activeFileId: currentFileId, activeYText: currentYText } = activeFileRef.current;
			if (fileId === currentFileId && currentYText?.doc) {
				if (!isCurrentTextMatch(currentYText.toJSON(), match)) {
					setState((previous) => ({ ...previous, error: "Result changed. Search again." }));
					return;
				}
				currentYText.doc.transact(() => replaceMatchInYText(currentYText, match, replacement));
				if (state.truncated) {
					setIsReplacing(true);
					try {
						await runSearch(state.query, state.caseSensitive);
					} finally {
						setIsReplacing(false);
					}
				} else {
					const merged = mergeActiveFileSearchResults(
						state.files,
						fileId,
						currentYText.toJSON(),
						state.query,
						state.caseSensitive,
					);
					setState((previous) => ({
						...previous,
						files: merged.files,
						totalMatches: merged.totalMatches,
						truncated: merged.activeFileTruncated,
						error: null,
					}));
				}
				return;
			}

			setIsReplacing(true);
			setState((previous) => ({ ...previous, error: null }));
			try {
				const response = await fetch(`${API_URL}/projects/${projectId}/search/replace`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						mode: "one",
						fileId,
						match: {
							startOffset: match.startOffset,
							endOffset: match.endOffset,
							matchedText: match.matchedText,
						},
						replacement,
					}),
				});
				const payload = await readJsonPayload<ProjectReplaceResponse>(response);
				if (!response.ok) {
					setState((previous) => ({
						...previous,
						error: payload?.error ?? `Could not replace match (${response.status}).`,
					}));
					return;
				}
				await runSearch(state.query, state.caseSensitive);
			} catch (error) {
				setState((previous) => ({
					...previous,
					error: error instanceof Error ? error.message : "Could not replace match.",
				}));
			} finally {
				setIsReplacing(false);
			}
		},
		[
			isReplacing,
			projectId,
			readOnly,
			runSearch,
			state.caseSensitive,
			state.files,
			state.query,
			state.truncated,
		],
	);

	const onReplaceInFile = useCallback(
		async (fileId: string, query: string, replacement: string, caseSensitive: boolean) => {
			if (readOnly || isReplacing || query.length === 0) {
				return;
			}

			const { activeFileId: currentFileId, activeYText: currentYText } = activeFileRef.current;
			if (fileId === currentFileId && currentYText?.doc) {
				const matches = findTextMatches(currentYText.toJSON(), query, { caseSensitive });
				if (matches.length > 0) {
					currentYText.doc.transact(() => {
						for (let index = matches.length - 1; index >= 0; index -= 1) {
							replaceMatchInYText(currentYText, matches[index]!, replacement);
						}
					});
					toast.success(
						`Replaced ${matches.length} ${matches.length === 1 ? "match" : "matches"} in ${fileId}.`,
					);
				}
				if (state.truncated) {
					setIsReplacing(true);
					try {
						await runSearch(query, caseSensitive);
					} finally {
						setIsReplacing(false);
					}
				} else {
					const merged = mergeActiveFileSearchResults(
						state.files,
						fileId,
						currentYText.toJSON(),
						query,
						caseSensitive,
					);
					setState((previous) => ({
						...previous,
						query,
						caseSensitive,
						files: merged.files,
						totalMatches: merged.totalMatches,
						truncated: merged.activeFileTruncated,
						error: null,
					}));
				}
				return;
			}

			setIsReplacing(true);
			setState((previous) => ({ ...previous, error: null }));
			try {
				const response = await fetch(`${API_URL}/projects/${projectId}/search/replace`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						mode: "all",
						query,
						replacement,
						caseSensitive,
						fileId,
					}),
				});
				const payload = await readJsonPayload<ProjectReplaceResponse>(response);
				if (!response.ok || !payload) {
					setState((previous) => ({
						...previous,
						error: payload?.error ?? `Could not replace matches (${response.status}).`,
					}));
					return;
				}
				if (payload.replacedMatches > 0) {
					toast.success(
						`Replaced ${payload.replacedMatches} ${payload.replacedMatches === 1 ? "match" : "matches"} in ${fileId}.`,
					);
				}
				await runSearch(query, caseSensitive);
			} catch (error) {
				setState((previous) => ({
					...previous,
					error: error instanceof Error ? error.message : "Could not replace matches.",
				}));
			} finally {
				setIsReplacing(false);
			}
		},
		[isReplacing, projectId, readOnly, runSearch, state.files, state.truncated],
	);

	const onReplaceAll = useCallback(
		async (query: string, replacement: string, caseSensitive: boolean) => {
			if (readOnly || isReplacing || query.length === 0) {
				return;
			}

			setIsReplacing(true);
			setState((previous) => ({ ...previous, error: null }));
			try {
				const response = await fetch(`${API_URL}/projects/${projectId}/search/replace`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						mode: "all",
						query,
						replacement,
						caseSensitive,
					}),
				});
				const payload = await readJsonPayload<ProjectReplaceResponse>(response);
				if (!response.ok || !payload) {
					setState((previous) => ({
						...previous,
						error: payload?.error ?? `Could not replace matches (${response.status}).`,
					}));
					return;
				}

				const fileCount = payload.updatedFiles?.length ?? 0;
				if (payload.replacedMatches > 0) {
					toast.success(
						`Replaced ${payload.replacedMatches} ${payload.replacedMatches === 1 ? "match" : "matches"} across ${fileCount} ${fileCount === 1 ? "file" : "files"}.`,
					);
				}
				// Use the authoritative server state right after server-side replace so a lagging
				// WebSocket Yjs update on the active file cannot resurrect replaced matches.
				await runSearch(query, caseSensitive, { skipLocalActiveFileMerge: true });
			} catch (error) {
				setState((previous) => ({
					...previous,
					error: error instanceof Error ? error.message : "Could not replace matches.",
				}));
			} finally {
				setIsReplacing(false);
			}
		},
		[isReplacing, projectId, readOnly, runSearch],
	);

	return {
		searchedQuery: state.query,
		searchedCaseSensitive: state.caseSensitive,
		files: state.files,
		totalMatches: state.totalMatches,
		truncated: state.truncated,
		skippedFiles: state.skippedFiles,
		error: state.error,
		isSearching,
		isReplacing,
		readOnly,
		onSearch,
		onReplaceOne,
		onReplaceInFile,
		onReplaceAll,
		onSelectMatch,
	};
}
