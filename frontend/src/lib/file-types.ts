import type { DeckFile } from "@/lib/types";

const IMAGE_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".svg",
	".bmp",
	".tiff",
]);

export function isEditableDeckFile(file: DeckFile | null | undefined): file is DeckFile {
	return file?.type === "markdown" || isCssDeckFile(file);
}

export function isCssFileId(fileId: string): boolean {
	return fileId.toLowerCase().endsWith(".css");
}

export function isCssDeckFile(file: DeckFile | null | undefined): boolean {
	return Boolean(file && file.type !== "folder" && isCssFileId(file.id));
}

export function isMarkdownDeckFile(file: DeckFile | null | undefined): file is DeckFile {
	return file?.type === "markdown" && !isCssDeckFile(file);
}

export function isImageDeckFile(file: DeckFile | null | undefined): file is DeckFile {
	if (file?.type !== "asset") {
		return false;
	}

	const dotIndex = file.id.lastIndexOf(".");
	if (dotIndex === -1) {
		return false;
	}

	return IMAGE_EXTENSIONS.has(file.id.slice(dotIndex).toLowerCase());
}
