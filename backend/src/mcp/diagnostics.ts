import { posix } from "node:path";
import { getCurrentDocumentContent } from "../collab/document-content.ts";
import { createMarpWithImageRewriter } from "../collab/marp-images.ts";
import { renderMarkdownForSlides } from "../collab/marp-render.ts";
import { isEditableExtension } from "../helpers/file-allowlist.ts";
import {
	renderSlideScreenshotViaGotenberg,
	SCREENSHOT_MIME_TYPES,
	type ScreenshotFormat,
} from "../helpers/gotenberg.ts";
import { logger } from "../helpers/logger.ts";
import { listProjectContent } from "../projects/project-content.ts";
import { getProjectFileSize, isMarkdownFileId } from "../projects/storage.ts";
import { toDocumentName } from "../../../shared/collaboration.ts";
import { prepareMarpTheme } from "../../../shared/marp-dialect.ts";
import {
	expandMarkdownIncludes,
	markdownIncludePaths,
	resolveIncludePath,
} from "../../../shared/markdown-include.ts";
import { isAtOrBelow } from "./project-files.ts";
import { PresentationToolError, requirePresentationAccess } from "./presentations.ts";

const MAX_SOURCE_CHARACTERS = 1_000_000;
const MAX_PROJECT_SCAN_CHARACTERS = 8_000_000;
const MAX_REPORTED_REFERENCES = 500;
export const MAX_VISUAL_PREVIEW_SLIDES = 5;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export type RenderedSlidePreview = {
	slide: number;
	width: number;
	height: number;
	mimeType: string;
	base64: string;
};

type ReferenceKind = "include" | "image" | "css-url";
type Reference = {
	source: string;
	kind: ReferenceKind;
	value: string;
	target: string | undefined;
	missing: boolean;
};

function cssUrls(css: string): string[] {
	const urls = css
		.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "")
		.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"\s()]+))\s*\)/gi);
	return Array.from(urls, (match) => match[1] ?? match[2] ?? match[3]!);
}

function resolveAssetPath(source: string, value: string): string | undefined {
	const path = decodeURIComponent(value.split(/[?#]/, 1)[0]!);
	const absolute = path.startsWith("/");
	const target = posix.normalize(
		absolute ? path.slice(1) : posix.join(posix.dirname(source), path),
	);
	return target.split("/").every((part) => part && !part.startsWith(".")) ? target : undefined;
}

function reference(
	files: ReadonlySet<string>,
	source: string,
	kind: ReferenceKind,
	value: string,
): Reference | undefined {
	let target: string | undefined;
	if (kind === "include") {
		target = resolveIncludePath(source, value);
		if (target && !isMarkdownFileId(target)) {
			target = undefined;
		}
	} else {
		if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(value)) {
			return undefined;
		}
		try {
			target = resolveAssetPath(source, value);
		} catch {
			// Invalid percent encoding leaves the local reference unresolved.
		}
	}
	return { source, kind, value, target, missing: !target || !files.has(target) };
}

async function projectSources(projectId: string, userId: string) {
	requirePresentationAccess(projectId, userId);
	const entries = await listProjectContent(projectId);
	const files = new Set(
		entries.filter((entry) => entry.type !== "folder").map((entry) => entry.id),
	);
	const sources = [...files].filter(isEditableExtension);
	let scanned = 0;
	const cache = new Map<string, Promise<string | undefined>>();
	const skipped: string[] = [];
	const read = async (path: string) => {
		if (!files.has(path) || !isEditableExtension(path)) {
			return undefined;
		}
		const size = await getProjectFileSize(projectId, path);
		if (size === undefined) {
			return undefined;
		}
		if (size > MAX_SOURCE_CHARACTERS * 4) {
			skipped.push(path);
			return undefined;
		}
		const content = await getCurrentDocumentContent(toDocumentName(projectId, path));
		if (content !== undefined) {
			if (
				content.length > MAX_SOURCE_CHARACTERS ||
				scanned + content.length > MAX_PROJECT_SCAN_CHARACTERS
			) {
				skipped.push(path);
				return undefined;
			}
			scanned += content.length;
		}
		return content;
	};
	return {
		entries,
		files,
		sources,
		skipped,
		read: (path: string) => {
			let pending = cache.get(path);
			if (!pending) {
				pending = read(path);
				cache.set(path, pending);
			}
			return pending;
		},
	};
}

export async function checkReferences(projectId: string, userId: string, path?: string) {
	const project = await projectSources(projectId, userId);
	if (path && !project.entries.some((entry) => entry.id === path)) {
		throw new PresentationToolError("File or folder not found. List files and try again.");
	}
	const references: Reference[] = [];
	let truncated = false;
	let source = "";
	let renderedCharacters = 0;
	const seen = new Set<string>();
	const collect = (kind: ReferenceKind, value: string) => {
		const ref = reference(project.files, source, kind, value);
		if (
			!ref ||
			(path && !isAtOrBelow(source, path) && !(ref.target && isAtOrBelow(ref.target, path)))
		) {
			return;
		}
		const key = JSON.stringify([kind, value]);
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		if (references.length === MAX_REPORTED_REFERENCES) {
			truncated = true;
			return;
		}
		references.push(ref);
	};
	const marp = createMarpWithImageRewriter(
		(src) => {
			collect("image", src);
			return src;
		},
		{ script: false },
	);
	for (const fileId of project.sources) {
		const content = await project.read(fileId);
		if (content === undefined) {
			continue;
		}
		source = fileId;
		seen.clear();
		if (isMarkdownFileId(fileId)) {
			for (const value of markdownIncludePaths(content)) {
				collect("include", value);
			}
			const remaining = MAX_PROJECT_SCAN_CHARACTERS - renderedCharacters;
			if (content.length > remaining) {
				project.skipped.push(fileId);
				continue;
			}
			const expanded = await expandMarkdownIncludes(content, fileId, project.read);
			if (expanded.length > remaining) {
				project.skipped.push(fileId);
				continue;
			}
			renderedCharacters += expanded.length;
			try {
				marp.render(expanded);
			} catch {
				project.skipped.push(fileId);
			}
		} else {
			for (const value of cssUrls(content)) {
				collect("css-url", value);
			}
		}
	}
	requirePresentationAccess(projectId, userId);
	return { path, references, skippedFiles: project.skipped, truncated };
}

export async function previewPresentation(
	projectId: string,
	userId: string,
	fileId: string,
	options?: { slides?: number[]; format?: ScreenshotFormat },
) {
	const project = await projectSources(projectId, userId);
	const source = await project.read(fileId);
	if (source === undefined) {
		throw new PresentationToolError(
			project.skipped.length
				? "Presentation exceeds the render size limit."
				: "Presentation not found.",
		);
	}

	const issues = new Set<string>();
	const markdown = await expandMarkdownIncludes(
		source,
		fileId,
		project.read,
		undefined,
		(issue) => {
			issues.add(`${issue.source}: ${issue.path}: ${issue.message}`);
		},
	);
	const marp = createMarpWithImageRewriter(
		(src) => {
			const ref = reference(project.files, fileId, "image", src);
			if (ref?.missing) {
				issues.add(`Missing image: ${src}`);
			}
			return src;
		},
		{ script: false },
	);

	for (const path of project.sources.filter((path) => !isMarkdownFileId(path))) {
		const css = await project.read(path);
		if (css !== undefined) {
			try {
				marp.themeSet.add(prepareMarpTheme(path, css));
			} catch {
				issues.add(`Could not load theme: ${path}`);
			}
		}
	}

	let slideCount: number | null = null;
	try {
		const rendered = marp.render(markdown, { htmlAsArray: true });
		slideCount = rendered.html.length;
	} catch {
		issues.add("Marp could not render the presentation.");
	}

	const images: RenderedSlidePreview[] = [];
	const requestedSlides = options?.slides ? Array.from(new Set(options.slides)) : [];
	if (requestedSlides.length > 0) {
		if (slideCount === null) {
			throw new PresentationToolError("Marp could not render the presentation for visual preview.");
		}
		const outOfRange = requestedSlides.find((slide) => slide < 1 || slide > slideCount);
		if (outOfRange !== undefined) {
			throw new PresentationToolError(
				`Slide ${outOfRange} is out of range (presentation has ${slideCount} ${slideCount === 1 ? "slide" : "slides"}).`,
			);
		}

		const format = options?.format ?? "png";
		const renderedDeck = await renderMarkdownForSlides(
			projectId,
			fileId,
			getCurrentDocumentContent,
		);
		if (!renderedDeck) {
			throw new PresentationToolError("Presentation not found.");
		}

		for (const slideNumber of requestedSlides) {
			requirePresentationAccess(projectId, userId);
			const targetSlide = renderedDeck.slides[slideNumber - 1];
			if (!targetSlide) {
				throw new PresentationToolError(
					`Slide ${slideNumber} is out of range (presentation has ${renderedDeck.slides.length} ${renderedDeck.slides.length === 1 ? "slide" : "slides"}).`,
				);
			}

			let response: Response;
			try {
				response = await renderSlideScreenshotViaGotenberg(
					projectId,
					targetSlide,
					renderedDeck.css,
					renderedDeck.assets,
					{ format },
				);
			} catch (error) {
				logger.error(error, "Failed to reach Gotenberg for visual slide preview");
				throw new PresentationToolError("Visual slide preview service is unavailable.");
			}

			if (!response.ok) {
				logger.error(
					{ status: response.status, body: await response.text() },
					"Visual slide preview failed",
				);
				throw new PresentationToolError("Visual slide preview failed.");
			}

			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.byteLength === 0 || buffer.byteLength > MAX_SCREENSHOT_BYTES) {
				throw new PresentationToolError("Rendered slide image is empty or exceeds the size limit.");
			}

			images.push({
				slide: slideNumber,
				width: targetSlide.width,
				height: targetSlide.height,
				mimeType: SCREENSHOT_MIME_TYPES[format],
				base64: buffer.toString("base64"),
			});
		}
	}

	requirePresentationAccess(projectId, userId);
	return {
		data: {
			fileId,
			slideCount,
			issues: [...issues].slice(0, MAX_REPORTED_REFERENCES),
			truncated: issues.size > MAX_REPORTED_REFERENCES,
			skippedFiles: project.skipped,
			...(images.length > 0
				? {
						renderedSlides: images.map(({ slide, width, height, mimeType }) => ({
							slide,
							width,
							height,
							mimeType,
						})),
					}
				: {}),
		},
		images,
	};
}
