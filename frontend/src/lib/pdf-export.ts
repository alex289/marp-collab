import fontkit from "@pdf-lib/fontkit";
import geistFontUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import notoEmojiFontUrl from "@fontsource/noto-emoji/files/noto-emoji-emoji-400-normal.woff2?url";
import unifontUrl from "@fontsource/unifont/files/unifont-latin-400-normal.woff2?url";
import { toPng } from "html-to-image";
import { type PDFFont, PDFDocument, setTextRenderingMode, TextRenderingMode } from "pdf-lib";

const PDF_POINTS_PER_CSS_PIXEL = 72 / 96;

export type ExportMarpPdfOptions = {
	html: string;
	css: string;
	filename: string;
};

async function dataUrlToUint8Array(dataUrl: string): Promise<Uint8Array> {
	const response = await fetch(dataUrl);
	return new Uint8Array(await response.arrayBuffer());
}

function downloadPdf(bytes: Uint8Array, filename: string): void {
	const blobBytes = new Uint8Array(bytes);
	const url = URL.createObjectURL(new Blob([blobBytes], { type: "application/pdf" }));
	const link = document.createElement("a");

	try {
		link.href = url;
		link.download = filename;
		link.style.display = "none";
		document.body.append(link);
		link.click();
	} finally {
		link.remove();
		URL.revokeObjectURL(url);
	}
}

export function toPdfFilename(name: string): string {
	const stem = name
		.trim()
		.replace(/\.[^.]+$/u, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return `${stem || "presentation"}.pdf`;
}

function createExportContainer({ html, css }: ExportMarpPdfOptions): HTMLDivElement {
	const container = document.createElement("div");
	container.setAttribute("aria-hidden", "true");
	container.style.cssText =
		"position:fixed;top:0;left:-100000px;z-index:-1;pointer-events:none;width:max-content;";

	const style = document.createElement("style");
	style.textContent = `
${css}

div.marpit {
	display: flex !important;
	flex-direction: column !important;
	align-items: flex-start !important;
	gap: 0 !important;
	width: max-content !important;
}

div.marpit > svg[data-marpit-svg] {
	display: block !important;
	flex: 0 0 auto !important;
	border: 0 !important;
	box-shadow: none !important;
	max-width: none !important;
}
`;

	container.append(style);
	container.insertAdjacentHTML("beforeend", html);
	document.body.append(container);
	return container;
}

type EmbeddedTextFont = {
	source: {
		hasGlyphForCodePoint(codePoint: number): boolean;
	};
	font: PDFFont;
};

type TextFragment = {
	text: string;
	rect: DOMRect;
	font: EmbeddedTextFont;
};

type Grapheme = {
	text: string;
	start: number;
	end: number;
};

function getGraphemes(text: string): Grapheme[] {
	if (typeof Intl.Segmenter === "function") {
		return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)).map(
			({ segment, index }) => ({ text: segment, start: index, end: index + segment.length }),
		);
	}

	let offset = 0;
	return Array.from(text, (segment) => {
		const grapheme = { text: segment, start: offset, end: offset + segment.length };
		offset += segment.length;
		return grapheme;
	});
}

function selectTextFont(text: string, fonts: EmbeddedTextFont[]): EmbeddedTextFont {
	const font = fonts.find(({ source }) =>
		Array.from(text).every((character) => source.hasGlyphForCodePoint(character.codePointAt(0)!)),
	);
	if (font) {
		return font;
	}

	const codePoints = Array.from(
		text,
		(character) => `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`,
	);
	throw new Error(`No embedded PDF font supports ${codePoints.join(", ")}.`);
}

function getTextFragments(slide: SVGSVGElement, fonts: EmbeddedTextFont[]): TextFragment[] {
	const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
	const fragments: TextFragment[] = [];
	let previous: { rect: DOMRect; font: EmbeddedTextFont } | undefined;
	let node = walker.nextNode();

	while (node) {
		const text = node.nodeValue ?? "";
		for (const grapheme of getGraphemes(text)) {
			const range = document.createRange();
			range.setStart(node, grapheme.start);
			range.setEnd(node, grapheme.end);
			const rect = Array.from(range.getClientRects()).find(
				(candidate) => candidate.width > 0 && candidate.height > 0,
			);
			const font = selectTextFont(grapheme.text, fonts);
			const positionedRect = rect ?? (/^\s+$/u.test(grapheme.text) ? previous?.rect : undefined);

			if (positionedRect) {
				fragments.push({ text: grapheme.text, rect: positionedRect, font });
				previous = { rect: positionedRect, font };
			}
		}

		node = walker.nextNode();
	}

	return fragments;
}

function loadTextFonts(pdf: PDFDocument): Promise<EmbeddedTextFont[]> {
	return Promise.all(
		[geistFontUrl, unifontUrl, notoEmojiFontUrl].map(async (url) => {
			const response = await fetch(url);
			const bytes = new Uint8Array(await response.arrayBuffer());
			return {
				source: fontkit.create(bytes),
				font: await pdf.embedFont(bytes),
			};
		}),
	);
}

export async function exportMarpPdf({ html, css, filename }: ExportMarpPdfOptions): Promise<void> {
	const container = createExportContainer({ html, css, filename });

	try {
		await document.fonts.ready;
		await Promise.all(Array.from(container.querySelectorAll("img"), (image) => image.decode()));

		const slides = Array.from(container.querySelectorAll<SVGSVGElement>("svg[data-marpit-svg]"));
		if (slides.length === 0) {
			throw new Error("No Marp slides available for PDF export.");
		}

		const pdf = await PDFDocument.create();
		pdf.registerFontkit(fontkit);
		const textFonts = await loadTextFonts(pdf);

		for (const slide of slides) {
			const slideRect = slide.getBoundingClientRect();
			if (slideRect.width === 0 || slideRect.height === 0) {
				throw new Error("Marp slide could not be measured for PDF export.");
			}

			const pageWidth = slideRect.width * PDF_POINTS_PER_CSS_PIXEL;
			const pageHeight = slideRect.height * PDF_POINTS_PER_CSS_PIXEL;
			const pngDataUrl = await toPng(slide as unknown as HTMLElement, {
				pixelRatio: 2,
				cacheBust: true,
				backgroundColor: "white",
				width: slideRect.width,
				height: slideRect.height,
				canvasWidth: slideRect.width * 2,
				canvasHeight: slideRect.height * 2,
			});
			const png = await pdf.embedPng(await dataUrlToUint8Array(pngDataUrl));
			const page = pdf.addPage([pageWidth, pageHeight]);
			page.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight });

			const xScale = pageWidth / slideRect.width;
			const yScale = pageHeight / slideRect.height;
			for (const fragment of getTextFragments(slide, textFonts)) {
				const x = (fragment.rect.left - slideRect.left) * xScale;
				const y = pageHeight - (fragment.rect.bottom - slideRect.top) * yScale;
				const size = fragment.rect.height * yScale;

				page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
				try {
					page.drawText(fragment.text, { font: fragment.font.font, size, x, y });
				} finally {
					page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill));
				}
			}
		}

		downloadPdf(await pdf.save(), toPdfFilename(filename));
	} finally {
		container.remove();
	}
}
