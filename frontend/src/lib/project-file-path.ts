export function normalizeProjectFilePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function getAncestorFolderPaths(fileId: string): string[] {
	const normalizedId = normalizeProjectFilePath(fileId);
	const segments = normalizedId.split("/").filter(Boolean);
	const ancestors: string[] = [];
	let currentPath = "";

	for (const segment of segments.slice(0, -1)) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		ancestors.push(currentPath);
	}

	return ancestors;
}

export function getParentFolderPath(fileId: string): string {
	const normalized = normalizeProjectFilePath(fileId);
	const lastSlash = normalized.lastIndexOf("/");
	return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
}

/** Returns a project file path relative to the folder containing the Markdown deck. */
export function getRelativeProjectFilePath(
	fromFileId: string | null,
	projectFileId: string,
): string {
	const fromFolderSegments = getParentFolderPath(fromFileId ?? "")
		.split("/")
		.filter(Boolean);
	const fileSegments = normalizeProjectFilePath(projectFileId).split("/").filter(Boolean);
	let sharedSegments = 0;

	while (
		sharedSegments < fromFolderSegments.length &&
		sharedSegments < fileSegments.length &&
		fromFolderSegments[sharedSegments] === fileSegments[sharedSegments]
	) {
		sharedSegments += 1;
	}

	return [
		...fromFolderSegments.slice(sharedSegments).map(() => ".."),
		...fileSegments.slice(sharedSegments),
	].join("/");
}
