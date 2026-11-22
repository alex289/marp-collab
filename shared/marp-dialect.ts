type ImageToken = {
	type: string;
	attrGet(name: string): string | null;
	attrSet(name: string, value: string): void;
	meta?: { marpitImage?: { url: string } } | null;
};

export const MARP_IMAGE_RULE = "marpit_background_image";

export function rewriteMarpImages(rewrite: (src: string) => string) {
	return ({ tokens }: { tokens: ImageToken[] }) => {
		for (const token of tokens) {
			if (token.type !== "image") {
				continue;
			}
			const src = token.attrGet("src");
			if (src) {
				const url = rewrite(src);
				token.attrSet("src", url);
				if (token.meta?.marpitImage) {
					token.meta.marpitImage.url = url;
				}
			}
		}
	};
}

const themeMarker = /\/\*[\s\S]*?@theme\s+([\w-]+)/;

export function defaultMarpThemeName(fileId: string): string {
	const base = fileId.split("/").at(-1) ?? fileId;
	return (
		base
			.replace(/\.css$/i, "")
			.toLowerCase()
			.replace(/[^\w-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "theme"
	);
}

export function prepareMarpTheme(fileId: string, css: string): string {
	return themeMarker.test(css) ? css : `/* @theme ${defaultMarpThemeName(fileId)} */\n${css}`;
}
