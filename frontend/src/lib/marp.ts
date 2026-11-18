import { Marp } from "@marp-team/marp-core";
import { API_URL } from "./config";
import { TAILWIND_DIRECTIVE, type SlideTailwind } from "../../../shared/slide-tailwind.ts";
import {
	hasMermaidDiagrams,
	mermaidFences,
	MERMAID_SLIDE_CSS,
} from "../../../shared/slide-mermaid.ts";
import type { TailwindCatalog } from "@/features/editor/completions";

let currentProjectId = "";
let currentMarkdownDir = "";
let currentAssetVersion = 0;
let currentAssetToken = "";

function assetQuery(version: number, token: string): string {
	const params = new URLSearchParams();
	if (version > 0) {
		params.set("v", String(version));
	}
	if (token) {
		params.set("token", token);
	}
	const query = params.toString();
	return query ? `?${query}` : "";
}

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

// A leading "/" is treated as relative to the project's file root, not the
// app's own origin — users have no reason to reference application files, only
// their own project assets.
function resolveAssetPath(dir: string, src: string): string {
	return src.startsWith("/") ? resolvePosixPath("", src.slice(1)) : resolvePosixPath(dir, src);
}

function rewriteImageSrc(src: string): string {
	if (!currentProjectId || /^(https?:\/\/|data:|\/\/)/.test(src)) {
		return src;
	}
	const resolved = resolveAssetPath(currentMarkdownDir, src);
	// The version query busts the browser cache after uploads replace a file
	// behind an otherwise stable URL.
	return `${API_URL}/projects/${currentProjectId}/files/${resolved}${assetQuery(currentAssetVersion, currentAssetToken)}`;
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

marp.use(mermaidFences);
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

let tailwindEnabled = false;
marp.customDirectives.global[TAILWIND_DIRECTIVE] = (value) => {
	tailwindEnabled = value === "true";
	return {};
};

let slideTailwind: SlideTailwind | undefined;
let slideTailwindLoading: Promise<void> | undefined;
const slideTailwindListeners = new Set<() => void>();

async function loadSlideTailwind() {
	try {
		const { loadSlideTailwind } = await import("./slide-tailwind");
		slideTailwind = await loadSlideTailwind();
	} catch {
		// Slides render without Tailwind utilities; the next render tries again.
		slideTailwindLoading = undefined;
		return;
	}
	for (const listener of slideTailwindListeners) {
		listener();
	}
}

function requestSlideTailwind() {
	slideTailwindLoading ??= loadSlideTailwind();
}

/** Notifies once the Tailwind compiler is loaded, so renders made without it can redo. */
export const subscribeSlideTailwind = (listener: () => void) => {
	slideTailwindListeners.add(listener);
	return () => {
		slideTailwindListeners.delete(listener);
	};
};

export const isSlideTailwindReady = () => slideTailwind !== undefined;

let tailwindCatalog: Promise<TailwindCatalog> | undefined;

async function importTailwindCatalog() {
	try {
		const { loadTailwindCatalog } = await import("./slide-tailwind");
		return await loadTailwindCatalog();
	} catch (error) {
		// Let the next completion request try again.
		tailwindCatalog = undefined;
		throw error;
	}
}

/** Tailwind classes and variants for editor completions, loaded once on demand. */
export const loadTailwindCatalog = () => (tailwindCatalog ??= importTailwindCatalog());

export const renderMarp = (
	markdown: string,
	projectId?: string,
	selectedFileId?: string | null,
	assetVersion = 0,
	assetToken = "",
) => {
	currentProjectId = projectId ?? "";
	currentAssetVersion = assetVersion;
	currentAssetToken = assetToken;
	const lastSlash = selectedFileId?.lastIndexOf("/") ?? -1;
	currentMarkdownDir = lastSlash > -1 ? selectedFileId!.slice(0, lastSlash + 1) : "";
	tailwindEnabled = false;
	const rendered = marp.render(markdown);
	if (hasMermaidDiagrams(rendered.html)) {
		rendered.css += MERMAID_SLIDE_CSS;
	}
	if (!tailwindEnabled) {
		return rendered;
	}
	if (!slideTailwind) {
		requestSlideTailwind();
		return rendered;
	}
	const tailwindCss = slideTailwind(rendered.html);
	return {
		...rendered,
		css: `${rendered.css}\n${projectId ? rewriteCssUrls(tailwindCss, projectId, selectedFileId ?? "", assetToken, assetVersion) : tailwindCss}`,
	};
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
export function rewriteCssUrls(
	css: string,
	projectId: string,
	fileId: string,
	assetToken = "",
	assetVersion = 0,
): string {
	const lastSlash = fileId.lastIndexOf("/");
	const cssDir = lastSlash > -1 ? fileId.slice(0, lastSlash + 1) : "";
	const query = assetQuery(assetVersion, assetToken);
	// `(` is excluded from the target so runs of `url(url(…` scan in linear time.
	return css.replace(
		/url\(\s*(['"]?)(?!https?:\/\/|data:|\/\/|#)([^'"\s()]+)\1\s*\)/gi,
		(_match, quote: string, src: string) => {
			const resolved = resolveAssetPath(cssDir, src);
			return `url(${quote}${API_URL}/projects/${projectId}/files/${resolved}${query}${quote})`;
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
