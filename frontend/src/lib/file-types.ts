import type { DeckFile } from "@/lib/types";

export function isEditableDeckFile(file: DeckFile | null | undefined): file is DeckFile {
	return file?.type === "markdown";
}

export function isMarkdownDeckFile(file: DeckFile | null | undefined): file is DeckFile {
	return isEditableDeckFile(file) && !file.id.endsWith(".css");
}
