import { expandMarkdownIncludes } from "../../../shared/markdown-include.ts";
import {
	MARP_IMAGE_RULE,
	prepareMarpTheme,
	rewriteMarpImages,
} from "../../../shared/marp-dialect.ts";
import { TAILWIND_DIRECTIVE } from "../../../shared/slide-tailwind.ts";
import { Marp } from "@marp-team/marp-core";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { getDeckFiles, getDocumentContent } from "../projects/storage.ts";
import { toDocumentName } from "../../../shared/collaboration.ts";
import { createSlideTailwind } from "./slide-tailwind.ts";

function resolvePosixPath(dir: string, src: string): string {
	return posix.normalize(posix.join(dir, src));
}

function dirOf(fileId: string): string {
	const dir = posix.dirname(fileId);
	return dir === "." ? "" : `${dir}/`;
}

// Substitute a transparent pixel for HTTP(S) URLs and absolute paths in PDF assets.
const INERT_ASSET_DATA_URI =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

/**
 * Marp inserts one constant browser script (heading fitting and polyfills) into every
 * render. The PDF's Content-Security-Policy allows exactly that script by its hash.
 * Comparing renders with and without the script gives its length, so the element is
 * isolated without parsing HTML.
 */
function marpScriptContent(): string | undefined {
	const options = { inlineSVG: true, printable: true } as const;
	const withScript = new Marp(options).render("").html;
	const withoutScript = new Marp({ ...options, script: false }).render("").html;
	const start = withScript.indexOf("<script>");
	const element = withScript.slice(start, start + withScript.length - withoutScript.length);
	if (start === -1 || !element.endsWith("</script>")) {
		return undefined;
	}
	return element.slice("<script>".length, -"</script>".length);
}

const marpScript = marpScriptContent();
// If the script cannot be isolated, export PDFs with scripting disabled.
export const MARP_SCRIPT_CSP_SOURCE = marpScript
	? `'sha256-${createHash("sha256").update(marpScript).digest("base64")}'`
	: "'none'";

// Excluding `@` keeps a failed match from scanning into later at-rules.
const importRuleRegex = /@import\s+(?:url\(\s*)?(['"]?)([^'");@]+)\1\s*\)?\s*;/gi;

function sanitizeThemeImports(css: string): string {
	return css.replace(importRuleRegex, (match, _quote: string, target: string) => {
		// Keep named theme imports and strip targets that look like URLs or paths.
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
	readDocument = getDocumentContent,
): Promise<RenderedPdfInput | undefined> {
	const rawMarkdown = await readDocument(toDocumentName(projectId, markdownFileId));
	if (rawMarkdown === undefined) {
		return undefined;
	}

	const markdownDir = dirOf(markdownFileId);
	const markdown = await expandMarkdownIncludes(rawMarkdown, markdownFileId, (fileId) =>
		readDocument(toDocumentName(projectId, fileId)),
	);

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

	function rewriteCssUrls(css: string, dir: string): string {
		// `(` is excluded from the target so runs of `url(url(…` scan in linear time.
		return css.replace(
			/url\(\s*(['"]?)(?!data:|#)([^'"\s()]+)\1\s*\)/gi,
			(_match, quote: string, src: string) => `url(${quote}${rewriteAssetRef(dir, src)}${quote})`,
		);
	}

	const marp = new Marp({
		html: {
			...Marp.html,
			img: {
				...(Marp.html.img as Record<string, boolean>),
				src: (value: string) => rewriteAssetRef(markdownDir, value),
			},
		},
		inlineSVG: true,
		printable: true,
	});

	marp.use((md) => {
		md.inline.ruler2.after(
			MARP_IMAGE_RULE,
			"rewrite_image_urls_flat",
			rewriteMarpImages((src) => rewriteAssetRef(markdownDir, src)),
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

		const rewrittenCss = rewriteCssUrls(sanitizeThemeImports(css), dirOf(file.id));

		try {
			marp.themeSet.add(prepareMarpTheme(file.id, rewrittenCss));
		} catch {
			// Skip CSS that Marpit cannot parse as a theme
		}
	}

	let tailwindEnabled = false;
	marp.customDirectives.global[TAILWIND_DIRECTIVE] = (value) => {
		tailwindEnabled = value === "true";
		return {};
	};

	const { html, css: themeCss } = marp.render(markdown);
	let css = themeCss;
	if (tailwindEnabled) {
		// Arbitrary values such as bg-[url(...)] resolve project assets like theme CSS.
		// Remote URLs hidden in other syntax are blocked by the PDF's CSP (gotenberg.ts).
		const tailwind = await createSlideTailwind();
		css += `\n${rewriteCssUrls(tailwind(html), markdownDir)}`;
	}
	const title = getFrontmatterField(markdown, "title") ?? basenameWithoutExt(markdownFileId);
	const author = getFrontmatterField(markdown, "author");
	const description = getFrontmatterField(markdown, "description");
	const keywords = getFrontmatterField(markdown, "keywords")
		?.split(",")
		.map((keyword) => keyword.trim())
		.filter(Boolean);
	return { html, css, assets, title, author, description, keywords };
}
