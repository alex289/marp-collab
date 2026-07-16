import { getCollaborator } from "../db/models/project-collaborator.ts";
import { getProjectById } from "../db/models/project.ts";

export type ProjectAccess = {
	isOwner: boolean;
	readOnly: boolean;
};

export type ProjectPermission = "read" | "write" | "manage";

export type ProjectAuthorization =
	| { allowed: true; access: ProjectAccess }
	| { allowed: false; reason: "no-access" | "read-only" | "not-owner" };

export function getProjectAccess(projectId: string, userId: string): ProjectAccess | undefined {
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

export function getProjectAuthorization(
	projectId: string,
	userId: string,
	permission: ProjectPermission,
): ProjectAuthorization {
	const access = getProjectAccess(projectId, userId);
	if (!access) {
		return { allowed: false, reason: "no-access" };
	}

	if (permission === "manage" && !access.isOwner) {
		return { allowed: false, reason: "not-owner" };
	}

	if (permission === "write" && access.readOnly) {
		return { allowed: false, reason: "read-only" };
	}

	return { allowed: true, access };
}
