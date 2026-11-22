import { readProjectFile } from "../projects/storage.ts";
import { MARP_SCRIPT_CSP_SOURCE, type RenderedPdfInput } from "../collab/marp-render.ts";
import { getMimeType } from "./file-allowlist.ts";

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://gotenberg:3000";

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

/** Gotenberg resolves the deck's assets by their flat filenames alongside index.html. */
export async function renderPdfViaGotenberg(
	projectId: string,
	rendered: RenderedPdfInput,
): Promise<Response> {
	const form = new FormData();
	form.append("files", new Blob([buildIndexHtml(rendered)], { type: "text/html" }), "index.html");

	for (const [fileId, flatName] of rendered.assets) {
		try {
			const bytes = await readProjectFile(projectId, fileId);
			if (!bytes) {
				continue;
			}
			form.append("files", new Blob([bytes], { type: getMimeType(fileId) }), flatName);
		} catch {
			// A missing or unreadable asset should not abort the PDF export.
		}
	}

	form.append("printBackground", "true");
	form.append("preferCssPageSize", "true");
	form.append("emulatedMediaType", "print");
	form.append("waitDelay", "2s");
	form.append("nativeBookmarks", "true");
	form.append("stages", buildStages(rendered));

	return fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
		method: "POST",
		body: form,
	});
}
