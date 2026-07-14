export type ProjectDocumentIdentity = {
	projectId: string;
	fileId: string;
};

export function toDocumentName(projectId: string, fileId: string): string {
	return `project/${projectId}/${fileId}`;
}

export function parseProjectDocumentName(documentName: string): ProjectDocumentIdentity | null {
	const parts = documentName.split("/");
	if (parts[0] !== "project" || !parts[1]) {
		return null;
	}

	return {
		projectId: parts[1],
		fileId: parts.slice(2).join("/"),
	};
}

export function documentBelongsToProject(documentName: string, projectId: string): boolean {
	return (
		parseProjectDocumentName(documentName)?.projectId === projectId &&
		documentName.startsWith(`project/${projectId}/`)
	);
}
