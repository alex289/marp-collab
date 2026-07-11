import { readFile } from "node:fs/promises";
import { resolveProjectFilePath } from "../collab/files.ts";
import type { RenderedPdfInput } from "../collab/marp-render.ts";
import { getMimeType } from "./file-allowlist.ts";

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://gotenberg:3000";

function buildIndexHtml(rendered: RenderedPdfInput): string {
	return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
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
	form.append("files", new Blob([buildIndexHtml(rendered)], { type: "text/html" }), "index.html");

	for (const [fileId, flatName] of rendered.assets) {
		const filePath = resolveProjectFilePath(projectId, fileId);
		if (!filePath) {
			continue;
		}

		try {
			const bytes = await readFile(filePath);
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
	form.append("generateDocumentOutline", "true");

	return fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
		method: "POST",
		body: form,
	});
}
