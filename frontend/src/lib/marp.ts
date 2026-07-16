import { Marp } from "@marp-team/marp-core";
import { API_URL } from "./config";

let currentProjectId = "";
let currentMarkdownDir = "";

export function resolvePosixPath(dir: string, src: string): string {
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

function rewriteImageSrc(src: string): string {
	if (!currentProjectId || /^(https?:\/\/|data:|\/\/)/.test(src) || src.startsWith("/")) {
		return src;
	}
	const resolved = resolvePosixPath(currentMarkdownDir, src);
	return `${API_URL}/projects/${currentProjectId}/files/${resolved}`;
}

const marp = new Marp({
	html: {
		...Marp.html, // Use Marps built-in HTML allowlist
		img: {
			...(Marp.html.img as Record<string, boolean>),
			src: (value: string) => rewriteImageSrc(value), // Rewrite <img src> to load from backend API
		},
	},
});

marp.use((md) => {
	// Plugin to rewrite markdown ![]() image URLs to point to the backend API
	md.inline.ruler2.after(
		"marpit_background_image",
		"rewrite_image_urls",
		({ tokens }: { tokens: any[] }) => {
			for (const token of tokens) {
				if (token.type !== "image") {
					continue;
				}
				const src = token.attrGet("src");
				if (!src) {
					continue;
				}
				const newSrc = rewriteImageSrc(src);
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

/**
 * Rewrites relative url(...) references in a CSS string to absolute backend API URLs.
 * Mirrors the image URL rewriting done for Markdown — background-image, @font-face src, etc.
 */
export function rewriteCssUrls(css: string, projectId: string, fileId: string): string {
	const lastSlash = fileId.lastIndexOf("/");
	const cssDir = lastSlash > -1 ? fileId.slice(0, lastSlash + 1) : "";
	return css.replace(
		/url\(\s*(['"]?)(?!https?:\/\/|data:|\/\/|#|\/)([^'"\s)]+)\1\s*\)/gi,
		(_match, quote: string, src: string) => {
			const resolved = resolvePosixPath(cssDir, src);
			return `url(${quote}${API_URL}/projects/${projectId}/files/${resolved}${quote})`;
		},
	);
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
