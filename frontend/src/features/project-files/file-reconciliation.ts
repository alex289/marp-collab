import type { DeckFile } from "../../lib/types.ts";
import { getAncestorFolderPaths } from "./file-tree.ts";

export type RenameResult =
	| { type: "file"; oldFileId: string; newFileId: string }
	| { type: "folder"; oldFolderPath: string; newFolderPath: string };

export function reconcileSelectedFileAfterMove(
	projectId: string,
	selectedFile: DeckFile | null,
	oldFileId: string,
	newFileId: string,
): DeckFile | null {
	return selectedFile?.id === oldFileId
		? withFileId(projectId, selectedFile, newFileId)
		: selectedFile;
}

export function reconcileSelectedFileAfterRename(
	projectId: string,
	selectedFile: DeckFile | null,
	result: RenameResult,
): DeckFile | null {
	if (!selectedFile) {
		return null;
	}

	if (result.type === "file") {
		return selectedFile.id === result.oldFileId
			? withFileId(projectId, selectedFile, result.newFileId)
			: selectedFile;
	}

	if (
		selectedFile.id !== result.oldFolderPath &&
		!selectedFile.id.startsWith(`${result.oldFolderPath}/`)
	) {
		return selectedFile;
	}

	const suffix = selectedFile.id.slice(result.oldFolderPath.length);
	return withFileId(projectId, selectedFile, `${result.newFolderPath}${suffix}`);
}

export function reconcileOpenFoldersAfterRename(
	openFolders: ReadonlyMap<string, boolean>,
	result: RenameResult,
): ReadonlyMap<string, boolean> {
	if (result.type === "file") {
		return openFolders;
	}

	const next = new Map<string, boolean>();
	let changed = false;

	for (const [path, open] of openFolders) {
		if (path === result.oldFolderPath || path.startsWith(`${result.oldFolderPath}/`)) {
			next.set(`${result.newFolderPath}${path.slice(result.oldFolderPath.length)}`, open);
			changed = true;
		} else {
			next.set(path, open);
		}
	}

	return changed ? next : openFolders;
}

export function expandOpenFoldersForSelection(
	openFolders: ReadonlyMap<string, boolean>,
	selectedFileId: string | null,
): ReadonlyMap<string, boolean> {
	if (!selectedFileId) {
		return openFolders;
	}

	const ancestors = getAncestorFolderPaths(selectedFileId);
	let changed = false;
	const next = new Map(openFolders);

	for (const folderPath of ancestors) {
		if (!next.get(folderPath)) {
			next.set(folderPath, true);
			changed = true;
		}
	}

	return changed ? next : openFolders;
}

function withFileId(projectId: string, file: DeckFile, fileId: string): DeckFile {
	return {
		...file,
		id: fileId,
		label: fileId,
		documentName: file.type === "markdown" ? `project/${projectId}/${fileId}` : file.documentName,
	};
}
