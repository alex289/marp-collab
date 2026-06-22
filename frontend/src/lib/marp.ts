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

	md.core.ruler.push("rewrite_html_img_urls", (state: any) => {
		if (!currentProjectId) {
			return;
		}
		for (const token of state.tokens) {
			if (token.type !== "html_inline" && token.type !== "html_block") {
				continue;
			}
			token.content = token.content.replace(
				/(<img[^>]+src=["'])(?!https?:\/\/|data:|\/\/)([^"']+)(["'])/gi,
				(_: string, pre: string, src: string, quote: string) => {
					const resolved = resolvePosixPath(currentMarkdownDir, src);
					return `${pre}${API_URL}/projects/${currentProjectId}/files/${resolved}${quote}`;
				},
			);
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

const customThemeNames = new Set<string>();
const themeMarkerRegex = /\/\*[\s\S]*?@theme\s+([\w-]+)/;

function sanitizeThemeName(fileId: string): string {
	const base = fileId.split("/").pop() ?? fileId;
	const name = base
		.replace(/\.css$/i, "")
		.toLowerCase()
		.replace(/[^\w-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return name || "theme";
}

function prepareThemeCss(css: string, fallbackName: string): { css: string; name: string } {
	const marker = themeMarkerRegex.exec(css);
	if (marker?.[1]) {
		return { css, name: marker[1] };
	}
	return { css: `/* @theme ${fallbackName} */\n${css}`, name: fallbackName };
}

/** Returns every registered theme name (built-ins plus project CSS themes). */
export const listThemeNames = (): string[] =>
	Array.from(marp.themeSet.themes(), (theme) => theme.name);

/**
 * Registers project CSS files as Marpit themes. A file becomes a theme named
 * after its own `@theme` marker, or after its file name when the marker is
 * missing. Replaces any previously registered project themes.
 */
export const setProjectThemes = (themes: Array<{ id: string; css: string }>): string[] => {
	for (const name of customThemeNames) {
		marp.themeSet.delete(name);
	}
	customThemeNames.clear();

	for (const { id, css } of themes) {
		try {
			const { css: prepared, name } = prepareThemeCss(css, sanitizeThemeName(id));
			marp.themeSet.delete(name);
			const theme = marp.themeSet.add(prepared);
			customThemeNames.add(theme.name);
		} catch {
			// Skip CSS that Marpit cannot parse as a theme.
		}
	}

	return listThemeNames();
};
