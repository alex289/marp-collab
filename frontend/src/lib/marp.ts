import { Marp } from "@marp-team/marp-core";
import { API_URL } from "./config";

let currentProjectId = "";
let currentMarkdownDir = "";

const marp = new Marp({ html: true });

marp.use((md) => {
	// Plugin to rewrite image URLs to point to the backend API
	md.inline.ruler2.after("marpit_background_image", "rewrite_image_urls", ({ tokens }) => {
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
			const resolved = new URL(src, new URL(currentMarkdownDir, self.location.href)).pathname.slice(
				1,
			);
			const newSrc = `${API_URL}/projects/${currentProjectId}/files/${resolved}`;
			token.attrSet("src", newSrc);
			if (token.meta?.marpitImage) {
				token.meta.marpitImage.url = newSrc;
			}
		}
	});
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
