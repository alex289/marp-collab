import { Marp } from "@marp-team/marp-core";
import { projectFilesUrl } from "./project-file-url.ts";
import {
	MARP_IMAGE_RULE,
	prepareMarpTheme,
	rewriteMarpImages,
} from "../../../shared/marp-dialect.ts";
import { TAILWIND_DIRECTIVE, type SlideTailwind } from "../../../shared/slide-tailwind.ts";
import type { TailwindCatalog } from "../features/editor/completions.ts";
import type { SlideSource } from "./slide-blocks.ts";
import { installSlideTransitions } from "./marp-transition.ts";

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

// Resolve leading slashes from the project root instead of the app origin.
function resolveAssetPath(dir: string, src: string): string {
	return src.startsWith("/") ? resolvePosixPath("", src.slice(1)) : resolvePosixPath(dir, src);
}

type SlideSourceToken = {
	type: string;
	map: [number, number] | null;
	meta?: { marpitDirectives?: Record<string, unknown> } | null;
};

/** What a slide edit must leave unchanged for the slides it doesn't move. */
export type SlideChecks = {
	/** Deck-wide directives and Tailwind. */
	slideSettings: string;
	/** Each slide's resolved directives, including those it inherits. */
	slideDirectives: string[];
};

export type SlideRender = ReturnType<Marp["render"]> & SlideChecks & { slideSource: SlideSource };
type SlideArrayRender = Omit<SlideRender, "html"> & { html: string[] };

class SourceMappedMarp extends Marp {
	tailwindEnabled = false;

	override render(markdown: string, env: { htmlAsArray: true }): SlideArrayRender;
	override render(markdown: string, env?: unknown): SlideRender;
	override render(markdown: string, env?: unknown): SlideRender | SlideArrayRender {
		const rendered = super.render(markdown, env);
		const slides: SlideSourceToken[][] = this.lastSlideTokens ?? [];
		const globals = this.lastGlobalDirectives ?? {};
		return {
			...rendered,
			slideSettings: JSON.stringify([
				Object.keys(globals)
					.sort()
					.map((key) => [key, globals[key]]),
				this.tailwindEnabled,
			]),
			slideDirectives: slides.map((slide) => {
				const directives =
					slide.find((token) => token.type === "marpit_slide_open")?.meta?.marpitDirectives ?? {};
				return JSON.stringify(
					Object.keys(directives)
						.sort()
						.map((key) => [key, directives[key]]),
				);
			}),
			slideSource: {
				startLines: slides.map(
					(slide) => slide.find((token) => token.type === "marpit_slide_open")?.map?.[0] ?? 0,
				),
				frontMatterEnd: slides[0]?.find((token) => token.type === "front_matter")?.map?.[1] ?? 0,
			},
		};
	}
}

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

export const loadTailwindCatalog = () => (tailwindCatalog ??= importTailwindCatalog());

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
			return `url(${quote}${projectFilesUrl(projectId)}/${resolved}${query}${quote})`;
		},
	);
}

export function createMarpRenderer(projectId: string) {
	const unchangedUrl = (src: string) => src;
	let rewriteImageSrc = unchangedUrl;
	const marp = new SourceMappedMarp({
		html: {
			...Marp.html,
			img: {
				...(Marp.html.img as Record<string, boolean>),
				src: (value: string) => rewriteImageSrc(value),
			},
		},
	});
	marp.use((md) => {
		md.inline.ruler2.after(
			MARP_IMAGE_RULE,
			"rewrite_image_urls",
			rewriteMarpImages((src) => rewriteImageSrc(src)),
		);
	});
	installSlideTransitions(marp);
	marp.customDirectives.global[TAILWIND_DIRECTIVE] = (value) => {
		marp.tailwindEnabled = value === "true";
		return {};
	};

	const builtinThemes = new Map(Array.from(marp.themeSet.themes(), (theme) => [theme.name, theme]));
	const customThemeNames = new Set<string>();
	const listThemeNames = () => Array.from(marp.themeSet.themes(), (theme) => theme.name);

	return {
		listThemeNames,
		setProjectThemes: (themes: Array<{ id: string; css: string }>) => {
			for (const name of customThemeNames) {
				marp.themeSet.delete(name);
				const builtin = builtinThemes.get(name);
				if (builtin) {
					marp.themeSet.addTheme(builtin);
				}
			}
			customThemeNames.clear();

			for (const { id, css } of themes) {
				try {
					const theme = marp.themeSet.add(prepareMarpTheme(id, css));
					customThemeNames.add(theme.name);
				} catch {
					// Skip CSS that Marpit cannot parse as a theme.
				}
			}
			return listThemeNames();
		},
		render(markdown: string, fileId: string | null, assetVersion: number, assetToken = "") {
			const directory = fileId?.slice(0, fileId.lastIndexOf("/") + 1) ?? "";
			const query = assetQuery(assetVersion, assetToken);
			rewriteImageSrc = (src) => {
				if (/^(https?:\/\/|data:|\/\/)/.test(src)) {
					return src;
				}
				const resolved = resolveAssetPath(directory, src);
				return `${projectFilesUrl(projectId)}/${resolved}${query}`;
			};
			marp.tailwindEnabled = false;
			try {
				const rendered = marp.render(markdown);
				if (!marp.tailwindEnabled) {
					return rendered;
				}
				if (!slideTailwind) {
					requestSlideTailwind();
					return rendered;
				}
				const css = rewriteCssUrls(
					slideTailwind(rendered.html),
					projectId,
					fileId ?? "",
					assetToken,
					assetVersion,
				);
				return { ...rendered, css: `${rendered.css}\n${css}` };
			} finally {
				rewriteImageSrc = unchangedUrl;
			}
		},
		analyzeSlides: (markdown: string) => {
			marp.tailwindEnabled = false;
			const { slideSource, slideSettings, slideDirectives } = marp.render(markdown);
			return { slideSource, slideSettings, slideDirectives };
		},
	};
}

export type MarpRenderer = ReturnType<typeof createMarpRenderer>;

/** The preview and presentation show a fallback slide when Marp can't render the deck. */
export type SlideDisplay = SlideRender | Pick<SlideRender, "html" | "css" | "comments">;
