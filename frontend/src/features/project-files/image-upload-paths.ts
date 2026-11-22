import type { DeckFile } from "../../lib/types.ts";
import {
	getAncestorFolderPaths,
	getParentFolderPath,
	normalizeProjectFilePath,
} from "../../lib/project-file-path.ts";

const IMAGE_FOLDER_NAMES = ["images", "assets"];

function getProjectFolderPaths(files: DeckFile[]): Map<string, string> {
	const folders = new Map<string, string>();

	for (const file of files) {
		const paths =
			file.type === "folder"
				? [normalizeProjectFilePath(file.id), ...getAncestorFolderPaths(file.id)]
				: getAncestorFolderPaths(file.id);

		for (const path of paths) {
			if (path) {
				folders.set(path.toLowerCase(), path);
			}
		}
	}

	return folders;
}

/** Use an existing image folder near the deck, or fall back to the deck's folder. */
export function getImageUploadDestination(files: DeckFile[], markdownFileId: string): string {
	const deckFolder = getParentFolderPath(markdownFileId);
	const folders = getProjectFolderPaths(files);
	const deckFolderName = deckFolder.split("/").at(-1)?.toLowerCase();

	if (deckFolderName && IMAGE_FOLDER_NAMES.includes(deckFolderName)) {
		return deckFolder;
	}

	for (const parent of deckFolder ? [deckFolder, ""] : [""]) {
		for (const name of IMAGE_FOLDER_NAMES) {
			const candidate = parent ? `${parent}/${name}` : name;
			const folder = folders.get(candidate.toLowerCase());
			if (folder) {
				return folder;
			}
		}
	}

	return deckFolder;
}
