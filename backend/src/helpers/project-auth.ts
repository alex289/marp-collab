import { getProjectById } from "../db/models/project.ts";
import { getCollaborator } from "../db/models/project-collaborator.ts";

export type ProjectAccess = {
	isOwner: boolean;
	readOnly: boolean;
};

export function getUserProjectAccess(projectId: string, userId: string): ProjectAccess | undefined {
	const project = getProjectById(projectId);
	if (!project) {
		return undefined;
	}

	if (project.ownerId === userId) {
		return { isOwner: true, readOnly: false };
	}

	const collaborator = getCollaborator(projectId, userId);
	if (!collaborator) {
		return undefined;
	}

	return { isOwner: false, readOnly: collaborator.readOnly };
}
