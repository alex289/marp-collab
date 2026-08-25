import { useEffect, useState } from "react";
import { hasMarkdownIncludes, resolveMarkdownIncludes } from "@/lib/markdown-include";

/**
 * Returns the markdown with `<!-- @include: file.md -->` comments expanded.
 * Resolution is async (included files are fetched from the backend); while it
 * is pending the previous resolved value is returned. Markdown without
 * includes passes through unchanged and synchronously.
 */
export function useIncludedMarkdown(
	markdown: string,
	projectId: string,
	fileId: string | null,
): string {
	const [resolved, setResolved] = useState(markdown);

	useEffect(() => {
		if (!hasMarkdownIncludes(markdown)) {
			setResolved(markdown);
			return;
		}

		let cancelled = false;
		void (async () => {
			const result = await resolveMarkdownIncludes(markdown, projectId, fileId);
			if (!cancelled) {
				setResolved(result);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [markdown, projectId, fileId]);

	return hasMarkdownIncludes(markdown) ? resolved : markdown;
}
