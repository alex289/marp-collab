import { Marp } from "@marp-team/marp-core";
import { posix } from "node:path";
import { getDeckFiles, getDocumentContent } from "../projects/storage.ts";
import { toDocumentName } from "../projects/document-identity.ts";

function resolvePosixPath(dir: string, src: string): string {
	return posix.normalize(posix.join(dir, src));
}

function dirOf(fileId: string): string {
	const dir = posix.dirname(fileId);
	return dir === "." ? "" : `${dir}/`;
}

// 1x1 transparent GIF. Replaced for any asset reference that looks like a URL or absolute path, to avoid SSRF attacks.
const INERT_ASSET_DATA_URI =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const themeMarkerRegex = /\/\*[\s\S]*?@theme\s+([\w-]+)/;

// Marpit's `@import "name";` is meant for inheriting from another registered theme by
// name (e.g. `@import "default";`), but Marpit does not validate the import target
// This prevents loading arbitrary CSS files from the filesystem or network
const importRuleRegex = /@import\s+(?:url\(\s*)?(['"]?)([^'");]+)\1\s*\)?\s*;/gi;

function sanitizeThemeImports(css: string): string {
	return css.replace(importRuleRegex, (match, _quote: string, target: string) => {
		const looksLikeUrlOrPath =
			/:\/\//.test(target) ||
			target.startsWith("/") ||
			target.startsWith(".") ||
			/\.[a-z]+$/i.test(target);
		return looksLikeUrlOrPath ? "" : match;
	});
}

const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;

function stripQuotes(value: string): string {
	const first = value[0];
	const last = value[value.length - 1];
	if (value.length >= 2 && first === last && (first === '"' || first === "'")) {
		return value.slice(1, -1);
	}
	return value;
}

/** Reads a directive (e.g. `title:`, `author:`) from a Marp markdown frontmatter, if present. */
function getFrontmatterField(markdown: string, field: string): string | undefined {
	const frontmatter = frontmatterRegex.exec(markdown);
	if (!frontmatter) {
		return undefined;
	}
	const lineRegex = new RegExp(`^${field}:\\s*(.+?)\\s*$`, "m");
	const line = lineRegex.exec(frontmatter[1]);
	return line ? stripQuotes(line[1]) : undefined;
}

function basenameWithoutExt(fileId: string): string {
	const base = posix.basename(fileId);
	const dotIndex = base.lastIndexOf(".");
	return dotIndex > 0 ? base.slice(0, dotIndex) : base;
}

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

export type RenderedPdfInput = {
	html: string;
	css: string;
	assets: Map<string, string>;
	title: string;
	author: string | undefined;
	description: string | undefined;
	keywords: string[] | undefined;
};

export async function renderMarkdownForPdf(
	projectId: string,
	markdownFileId: string,
): Promise<RenderedPdfInput | undefined> {
	const markdown = await getDocumentContent(toDocumentName(projectId, markdownFileId));
	if (markdown === undefined) {
		return undefined;
	}

	const assets = new Map<string, string>();
	let assetCounter = 0;

	function toFlatName(fileId: string): string {
		let flat = assets.get(fileId);
		if (!flat) {
			const basename = posix.basename(fileId);
			const dotIndex = basename.lastIndexOf(".");
			const ext = dotIndex > 0 ? basename.slice(dotIndex) : "";
			flat = `asset${assetCounter++}${ext}`;
			assets.set(fileId, flat);
		}
		return flat;
	}

	function rewriteAssetRef(dir: string, src: string): string {
		if (src.startsWith("data:")) {
			return src;
		}
		if (/^(https?:\/\/|\/\/)/.test(src) || src.startsWith("/")) {
			return INERT_ASSET_DATA_URI;
		}
		return toFlatName(resolvePosixPath(dir, src));
	}

	const markdownDir = dirOf(markdownFileId);

	const marp = new Marp({
		html: {
			...Marp.html, // Use Marp's own safe default allowlist
			img: {
				...(Marp.html.img as Record<string, boolean>),
				src: (value: string) => rewriteAssetRef(markdownDir, value), // Rewrite <img src>
			},
		},
		inlineSVG: true,
		printable: true,
	});

	// Rewrite markdown image urls
	marp.use((md) => {
		md.inline.ruler2.after(
			"marpit_background_image",
			"rewrite_image_urls_flat",
			({ tokens }: { tokens: any[] }) => {
				for (const token of tokens) {
					if (token.type !== "image") {
						continue;
					}
					const src = token.attrGet("src");
					if (!src) {
						continue;
					}
					const rewritten = rewriteAssetRef(markdownDir, src);
					token.attrSet("src", rewritten);
					if (token.meta?.marpitImage) {
						token.meta.marpitImage.url = rewritten;
					}
				}
			},
		);
	});

	const deckFiles = await getDeckFiles(projectId);
	for (const file of deckFiles) {
		if (!file.id.toLowerCase().endsWith(".css")) {
			continue;
		}

		const css = await getDocumentContent(toDocumentName(projectId, file.id));
		if (css === undefined) {
			continue;
		}

		const cssDir = dirOf(file.id);
		const rewrittenCss = sanitizeThemeImports(css).replace(
			/url\(\s*(['"]?)(?!data:|#)([^'"\s)]+)\1\s*\)/gi,
			(_match, quote: string, src: string) =>
				`url(${quote}${rewriteAssetRef(cssDir, src)}${quote})`,
		);

		try {
			const { css: prepared } = prepareThemeCss(rewrittenCss, sanitizeThemeName(file.id));
			marp.themeSet.add(prepared);
		} catch {
			// Skip CSS that Marpit cannot parse as a theme
		}
	}

	const { html, css } = marp.render(markdown);
	const title = getFrontmatterField(markdown, "title") ?? basenameWithoutExt(markdownFileId);
	const author = getFrontmatterField(markdown, "author");
	const description = getFrontmatterField(markdown, "description");
	const keywords = getFrontmatterField(markdown, "keywords")
		?.split(",")
		.map((keyword) => keyword.trim())
		.filter(Boolean);
	return { html, css, assets, title, author, description, keywords };
}
