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
	return (file?.type === "markdown" || file?.id.endsWith(".css")) ?? false;
}

export function isMarkdownDeckFile(file: DeckFile | null | undefined): file is DeckFile {
	return isEditableDeckFile(file) && !file.id.endsWith(".css");
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
