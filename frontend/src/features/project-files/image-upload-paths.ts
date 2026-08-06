import type { DeckFile } from "../../lib/types.ts";
import {
	getAncestorFolderPaths,
	getParentFolderPath,
	normalizeProjectFilePath,
} from "./file-tree.ts";

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

/**
 * Picks a conventional image folder near the Markdown deck without creating one.
 * If none exists, images stay beside the deck as before.
 */
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

/** Returns a project file path relative to the folder containing the Markdown deck. */
export function getMarkdownRelativeFilePath(markdownFileId: string, projectFileId: string): string {
	const deckFolderSegments = getParentFolderPath(markdownFileId).split("/").filter(Boolean);
	const fileSegments = normalizeProjectFilePath(projectFileId).split("/").filter(Boolean);
	let sharedSegments = 0;

	while (
		sharedSegments < deckFolderSegments.length &&
		sharedSegments < fileSegments.length &&
		deckFolderSegments[sharedSegments] === fileSegments[sharedSegments]
	) {
		sharedSegments += 1;
	}

	return [
		...deckFolderSegments.slice(sharedSegments).map(() => ".."),
		...fileSegments.slice(sharedSegments),
	].join("/");
}
