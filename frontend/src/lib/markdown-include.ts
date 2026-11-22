import { projectFileUrl } from "./project-file-url.ts";
import { expandMarkdownIncludes } from "../../../shared/markdown-include.ts";
export { hasMarkdownIncludes } from "../../../shared/markdown-include.ts";

export async function resolveMarkdownIncludes(
	markdown: string,
	projectId: string,
	currentFileId: string | null,
	signal?: AbortSignal,
	onSourceLines?: (lines: number[]) => void,
): Promise<string> {
	if (!projectId) {
		return markdown;
	}
	return await expandMarkdownIncludes(
		markdown,
		currentFileId ?? "",
		async (fileId) => {
			const response = await fetch(projectFileUrl(projectId, fileId), {
				signal,
				cache: "no-store",
			});
			if (response.status === 404) {
				return undefined;
			}
			if (!response.ok) {
				throw new Error("Could not load included Markdown");
			}
			return response.text();
		},
		onSourceLines,
	);
}
