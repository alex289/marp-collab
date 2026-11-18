import { collectCssReferences } from "./asset-diagnostics.ts";
import { API_URL } from "./config.ts";

// Embedded fonts are re-sent to the preview with every render, so larger files
// keep their URL instead of bloating each push.
export const MAX_EMBEDDED_FONT_BYTES = 5 * 1024 * 1024;
const FONT_FETCH_TIMEOUT_MS = 10_000;

const fontMimeTypes: Record<string, string> = {
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
};

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

async function fetchFont(path: string, mimeType: string): Promise<string | undefined> {
	const response = await fetch(path, {
		redirect: "error",
		signal: AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS),
	});
	if (
		!response.ok ||
		!response.headers.get("Content-Type")?.startsWith("font/") ||
		Number(response.headers.get("Content-Length")) > MAX_EMBEDDED_FONT_BYTES
	) {
		return undefined;
	}

	const font = new Uint8Array(await response.arrayBuffer());
	if (font.byteLength > MAX_EMBEDDED_FONT_BYTES) {
		return undefined;
	}
	// The MIME type comes from the extension, not the response, so it cannot break out of url().
	return `data:${mimeType};base64,${toBase64(font)}`;
}

export async function inlineProjectThemeFonts(
	css: string,
	projectId: string,
	requests: Map<string, Promise<string | undefined>>,
): Promise<string> {
	const prefix = `${API_URL}/projects/${projectId}/files/`;
	const fonts = await Promise.all(
		collectCssReferences(css).map(async ({ from, to, reference }) => {
			if (!reference.startsWith(prefix)) {
				return null;
			}
			// Only the normalized path matters; the base just makes the URL parseable.
			const path = new URL(reference, "http://localhost").pathname;
			const extension = /\.(woff2?|ttf|otf)$/i.exec(path)?.[1]?.toLowerCase();
			const mimeType = extension ? fontMimeTypes[extension] : undefined;
			if (!path.startsWith(prefix) || !mimeType) {
				return null;
			}

			// WHY: An opaque-origin iframe cannot authenticate font requests to an access proxy.
			let request = requests.get(path);
			if (!request) {
				const fetched = fetchFont(path, mimeType);
				request = fetched.catch(() => {
					// Retry network failures and timeouts on the next theme update. Missing,
					// oversized, or non-font files stay cached until the file list changes.
					if (requests.get(path) === request) {
						requests.delete(path);
					}
					return undefined;
				});
				requests.set(path, request);
			}
			const dataUrl = await request;
			return dataUrl ? { from, to, dataUrl } : null;
		}),
	);

	for (const font of fonts.reverse()) {
		if (font) {
			css = css.slice(0, font.from) + font.dataUrl + css.slice(font.to);
		}
	}
	return css;
}
