import { getCollaborator } from "../db/models/project-collaborator.ts";
import { getProjectById } from "../db/models/project.ts";

export type ProjectAccess = {
	isOwner: boolean;
	readOnly: boolean;
};

export type ProjectPermission = "read" | "write" | "manage-collaborators";

export type ProjectAuthorization =
	| { allowed: true; access: ProjectAccess }
	| { allowed: false; reason: "no-access" | "read-only" | "not-owner" };

export function authorizeProject(
	projectId: string,
	userId: string,
	permission: ProjectPermission,
): ProjectAuthorization {
	const project = getProjectById(projectId);
	if (!project) {
		return { allowed: false, reason: "no-access" };
	}

	if (project.ownerId === userId) {
		return {
			allowed: true,
			access: { isOwner: true, readOnly: false },
		};
	}

	const collaborator = getCollaborator(projectId, userId);
	if (!collaborator) {
		return { allowed: false, reason: "no-access" };
	}

	if (permission === "manage-collaborators") {
		return { allowed: false, reason: "not-owner" };
	}

	if (permission === "write" && collaborator.readOnly) {
		return { allowed: false, reason: "read-only" };
	}

	return {
		allowed: true,
		access: { isOwner: false, readOnly: collaborator.readOnly },
	};
}
