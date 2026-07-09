import fontkit from "@pdf-lib/fontkit";
import geistFontUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import { toPng } from "html-to-image";
import { PDFDocument, setTextRenderingMode, TextRenderingMode } from "pdf-lib";

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

type TextFragment = {
	text: string;
	rect: DOMRect;
};

function getTextFragments(slide: SVGSVGElement): TextFragment[] {
	const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
	const fragments: TextFragment[] = [];
	let node = walker.nextNode();

	while (node) {
		const text = node.nodeValue ?? "";
		if (text.trim().length > 0) {
			const range = document.createRange();
			range.selectNodeContents(node);
			const rect = Array.from(range.getClientRects()).find(
				(candidate) => candidate.width > 0 && candidate.height > 0,
			);

			if (rect) {
				// A wrapped text node can have several rectangles. Keeping the first
				// nonzero rectangle preserves the text once instead of duplicating it.
				fragments.push({ text, rect });
			}
		}

		node = walker.nextNode();
	}

	return fragments;
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
		const fontResponse = await fetch(geistFontUrl);
		const font = await pdf.embedFont(await fontResponse.arrayBuffer());

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
			for (const fragment of getTextFragments(slide)) {
				const x = (fragment.rect.left - slideRect.left) * xScale;
				const y = pageHeight - (fragment.rect.bottom - slideRect.top) * yScale;
				const size = fragment.rect.height * yScale;

				page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
				try {
					page.drawText(fragment.text, { font, size, x, y });
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
