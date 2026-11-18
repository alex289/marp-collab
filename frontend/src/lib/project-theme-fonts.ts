import { collectCssReferences } from "./asset-diagnostics.ts";
import { API_URL } from "./config.ts";

async function fetchFont(path: string): Promise<string | undefined> {
	try {
		const response = await fetch(path, { redirect: "error" });
		if (!response.ok || !response.headers.get("Content-Type")?.startsWith("font/")) {
			return undefined;
		}

		const font = await response.blob();
		return await new Promise<string | undefined>((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () =>
				resolve(typeof reader.result === "string" ? reader.result : undefined);
			reader.readAsDataURL(font);
		});
	} catch {
		return undefined;
	}
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
			const path = new URL(reference, window.location.origin).pathname;
			if (!path.startsWith(prefix) || !/\.(woff2?|ttf|otf)$/i.test(path)) {
				return null;
			}

			// WHY: An opaque-origin iframe cannot authenticate font requests to an access proxy.
			let request = requests.get(path);
			if (!request) {
				request = fetchFont(path);
				requests.set(path, request);
			}
			const dataUrl = await request;
			if (!dataUrl && requests.get(path) === request) {
				requests.delete(path);
			}
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
