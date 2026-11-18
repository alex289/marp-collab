import { readProjectFile } from "../projects/storage.ts";
import { MARP_SCRIPT_CSP_SOURCE, type RenderedPdfInput } from "../collab/marp-render.ts";
import { getMimeType } from "./file-allowlist.ts";
import { getMermaidRenderer } from "./mermaid-assets.ts";

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
 * Deck HTML and CSS are user-authored, and CSS can reference URLs in ways no rewrite
 * catches reliably (image-set(), escapes, inline <style>). The policy keeps Chromium
 * on the uploaded files, with two fixed exceptions: the font CDNs used by Marp's
 * built-in themes (Gaia's Lato) and KaTeX math.
 */
function pdfContentSecurityPolicy(mermaidHash?: string): string {
	const scripts = [MARP_SCRIPT_CSP_SOURCE, mermaidHash ? `'sha256-${mermaidHash}'` : undefined];
	return [
		"default-src 'none'",
		`script-src ${scripts.filter(Boolean).join(" ")}`,
		"style-src 'unsafe-inline' https://fonts.bunny.net",
		"font-src file: data: https://fonts.bunny.net https://cdn.jsdelivr.net",
		"img-src file: data:",
		"media-src file: data:",
	].join("; ");
}

export const PDF_CONTENT_SECURITY_POLICY = pdfContentSecurityPolicy();

async function buildIndexHtml(rendered: RenderedPdfInput): Promise<string> {
	const mermaid = rendered.hasMermaid ? await getMermaidRenderer() : undefined;
	const policy = mermaid ? pdfContentSecurityPolicy(mermaid.hash) : PDF_CONTENT_SECURITY_POLICY;
	return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${policy}" />
${mermaid ? `<script>${mermaid.script}</script>` : ""}
<style>${rendered.css}</style>
</head>
<body>${rendered.html}</body>
</html>`;
}

/**
 * Submits the rendered deck and its referenced assets to Gotenberg's Chromium HTML
 * conversion route. Assets are uploaded as flat, locally-named files alongside
 * index.html so Chromium resolves them without any network fetch or authentication.
 */
export async function renderPdfViaGotenberg(
	projectId: string,
	rendered: RenderedPdfInput,
): Promise<Response> {
	const form = new FormData();
	form.append(
		"files",
		new Blob([await buildIndexHtml(rendered)], { type: "text/html" }),
		"index.html",
	);

	for (const [fileId, flatName] of rendered.assets) {
		try {
			const bytes = await readProjectFile(projectId, fileId);
			if (!bytes) {
				continue;
			}
			form.append("files", new Blob([bytes], { type: getMimeType(fileId) }), flatName);
		} catch {
			// Skip missing files instead of failing the render
			// Marp itself is never failing on missing assets
		}
	}

	form.append("printBackground", "true");
	form.append("preferCssPageSize", "true");
	form.append("emulatedMediaType", "print");
	form.append("waitDelay", "2s");
	if (rendered.hasMermaid) {
		form.append("waitForExpression", "window.__marpMermaidReady === true");
	}
	form.append("nativeBookmarks", "true");
	form.append("stages", buildStages(rendered));

	return fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
		method: "POST",
		body: form,
	});
}
