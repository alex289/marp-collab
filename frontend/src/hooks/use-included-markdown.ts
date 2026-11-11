import { useEffect, useState } from "react";
import { hasMarkdownIncludes, resolveMarkdownIncludes } from "@/lib/markdown-include";

/** Refresh included documents even when the main deck has not changed. */
export function useIncludedMarkdown(markdown: string, projectId: string, fileId: string | null) {
	const [resolved, setResolved] = useState<{
		projectId: string;
		fileId: string | null;
		result: string;
		sourceLines: number[];
	} | null>(null);
	useEffect(() => {
		if (!hasMarkdownIncludes(markdown)) {
			return;
		}
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		async function refresh() {
			try {
				let sourceLines: number[] = [];
				const result = await resolveMarkdownIncludes(
					markdown,
					projectId,
					fileId,
					controller.signal,
					(lines) => {
						sourceLines = lines;
					},
				);
				if (!controller.signal.aborted) {
					setResolved({ projectId, fileId, result, sourceLines });
				}
			} catch {
				if (!controller.signal.aborted) {
					setResolved({
						projectId,
						fileId,
						sourceLines: [],
						result: "> ⚠️ **Include error:** Could not load included Markdown. Retrying…",
					});
				}
			} finally {
				if (!controller.signal.aborted) {
					timer = setTimeout(() => void refresh(), 3000);
				}
			}
		}
		void refresh();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, [markdown, projectId, fileId]);
	// Keep the last expansion while typing; never reuse another file or project.
	return hasMarkdownIncludes(markdown) &&
		resolved?.projectId === projectId &&
		resolved.fileId === fileId
		? { markdown: resolved.result, sourceLines: resolved.sourceLines }
		: { markdown, sourceLines: [] };
}
