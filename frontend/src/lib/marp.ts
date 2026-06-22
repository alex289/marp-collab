import { Marp } from "@marp-team/marp-core";
import { API_URL } from "./config";

let currentProjectId = "";
let currentMarkdownDir = "";

function resolvePosixPath(dir: string, src: string): string {
	const parts = (dir + src).split("/");
	const stack: string[] = [];
	for (const p of parts) {
		if (p === "..") {
			stack.pop();
		} else if (p && p !== ".") {
			stack.push(p);
		}
	}
	return stack.join("/");
}

const marp = new Marp({ html: true });

marp.use((md) => {
	// Plugin to rewrite image URLs to point to the backend API
	md.inline.ruler2.after(
		"marpit_background_image",
		"rewrite_image_urls",
		({ tokens }: { tokens: any[] }) => {
			if (!currentProjectId) {
				return;
			}
			for (const token of tokens) {
				if (token.type !== "image") {
					continue;
				}
				const src = token.attrGet("src");
				if (!src || /^(https?:\/\/|data:|\/\/)/.test(src) || src.startsWith("/")) {
					continue;
				}
				const resolved = resolvePosixPath(currentMarkdownDir, src);
				const newSrc = `${API_URL}/projects/${currentProjectId}/files/${resolved}`;
				token.attrSet("src", newSrc);
				if (token.meta?.marpitImage) {
					token.meta.marpitImage.url = newSrc;
				}
			}
		},
	);
});

export const renderMarp = (
	markdown: string,
	projectId?: string,
	selectedFileId?: string | null,
) => {
	currentProjectId = projectId ?? "";
	const lastSlash = selectedFileId?.lastIndexOf("/") ?? -1;
	currentMarkdownDir = lastSlash > -1 ? selectedFileId!.slice(0, lastSlash + 1) : "";
	return marp.render(markdown);
};
