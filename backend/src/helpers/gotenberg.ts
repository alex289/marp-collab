import { readProjectFile } from "../projects/storage.ts";
import {
	MARP_INLINE_SCRIPT,
	MARP_SCRIPT_CSP_SOURCE,
	type RenderedPdfInput,
	type RenderedSlide,
} from "../collab/marp-render.ts";
import { getMimeType } from "./file-allowlist.ts";

function getGotenbergUrl(): string {
	return process.env.GOTENBERG_URL ?? "http://gotenberg:3000";
}

export type ScreenshotFormat = "png" | "jpeg" | "webp";

export const SCREENSHOT_MIME_TYPES: Record<ScreenshotFormat, string> = {
	png: "image/png",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

const SCREENSHOT_TIMEOUT_MS = 30_000;
const SCREENSHOT_JPEG_QUALITY = "85";

function buildStages(rendered: RenderedPdfInput): string {
	const metadata: Record<string, string> = {
		op: "set-metadata",
		title: rendered.title,
		creator: "Marp Collab",
	};
	if (rendered.author) {
		metadata.author = rendered.author;
	}
	if (rendered.description) {
		metadata.subject = rendered.description;
	}
	if (rendered.keywords?.length) {
		metadata.keywords = rendered.keywords.join(", ");
	}
	return JSON.stringify([metadata]);
}

/**
 * User-authored CSS can fetch resources even after URL rewriting. Limit PDF rendering to
 * local assets and the font CDNs used by Marp themes and KaTeX.
 */
export const PDF_CONTENT_SECURITY_POLICY = [
	"default-src 'none'",
	`script-src ${MARP_SCRIPT_CSP_SOURCE}`,
	"style-src 'unsafe-inline' https://fonts.bunny.net",
	"font-src file: data: https://fonts.bunny.net https://cdn.jsdelivr.net",
	"img-src file: data:",
	"media-src file: data:",
].join("; ");

function buildIndexHtml(rendered: RenderedPdfInput): string {
	return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${PDF_CONTENT_SECURITY_POLICY}" />
<style>${rendered.css}</style>
</head>
<body>${rendered.html}</body>
</html>`;
}

function buildSlideScreenshotHtml(slide: RenderedSlide, css: string): string {
	const scriptTag = MARP_INLINE_SCRIPT ? `<script>${MARP_INLINE_SCRIPT}</script>` : "";
	return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${PDF_CONTENT_SECURITY_POLICY}" />
<style>
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
div.marpit { width: 100%; height: 100%; }
div.marpit > svg[data-marpit-svg] { display: block; width: 100%; height: 100%; }
${css}
</style>
</head>
<body><div class="marpit">${slide.html}</div>${scriptTag}</body>
</html>`;
}

async function appendProjectAssets(
	form: FormData,
	projectId: string,
	assets: Map<string, string>,
	filter?: (flatName: string) => boolean,
): Promise<void> {
	for (const [fileId, flatName] of assets) {
		if (filter && !filter(flatName)) {
			continue;
		}
		try {
			const bytes = await readProjectFile(projectId, fileId);
			if (!bytes) {
				continue;
			}
			form.append("files", new Blob([bytes], { type: getMimeType(fileId) }), flatName);
		} catch {
			// A missing or unreadable asset should not abort the render.
		}
	}
}

/** Gotenberg resolves the deck's assets by their flat filenames alongside index.html. */
export async function renderPdfViaGotenberg(
	projectId: string,
	rendered: RenderedPdfInput,
): Promise<Response> {
	const form = new FormData();
	form.append("files", new Blob([buildIndexHtml(rendered)], { type: "text/html" }), "index.html");
	await appendProjectAssets(form, projectId, rendered.assets);

	form.append("printBackground", "true");
	form.append("preferCssPageSize", "true");
	form.append("emulatedMediaType", "print");
	form.append("waitDelay", "2s");
	form.append("nativeBookmarks", "true");
	form.append("stages", buildStages(rendered));

	return fetch(`${getGotenbergUrl()}/forms/chromium/convert/html`, {
		method: "POST",
		body: form,
	});
}

/** Captures a single rendered slide as an image using Gotenberg's Chromium screenshot route. */
export async function renderSlideScreenshotViaGotenberg(
	projectId: string,
	slide: RenderedSlide,
	css: string,
	assets: Map<string, string>,
	options?: { format?: ScreenshotFormat },
): Promise<Response> {
	const format = options?.format ?? "png";
	const form = new FormData();
	form.append(
		"files",
		new Blob([buildSlideScreenshotHtml(slide, css)], { type: "text/html" }),
		"index.html",
	);
	await appendProjectAssets(
		form,
		projectId,
		assets,
		(flatName) => slide.html.includes(flatName) || css.includes(flatName),
	);

	form.append("width", String(slide.width));
	form.append("height", String(slide.height));
	form.append("clip", "true");
	form.append("format", format);
	if (format === "jpeg") {
		form.append("quality", SCREENSHOT_JPEG_QUALITY);
	}
	form.append("optimizeForSpeed", "true");
	form.append("emulatedMediaType", "screen");
	form.append("waitDelay", "1s");

	return fetch(`${getGotenbergUrl()}/forms/chromium/screenshot/html`, {
		method: "POST",
		body: form,
		signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
	});
}
