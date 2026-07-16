import { closeProjectCollaboratorConnections } from "../collab/connections.ts";
import {
	addCollaborator,
	getCollaborator,
	getCollaboratorsByProjectId,
	removeCollaborator,
	updateCollaborator,
	type ProjectCollaborator,
} from "../db/models/project-collaborator.ts";
import { getUserByEmail } from "../db/models/user.ts";

export type MembershipFailure =
	| "user-not-found"
	| "already-collaborator"
	| "collaborator-not-found";

type MembershipSuccess<T> = [T] extends [undefined] ? { ok: true } : { ok: true; value: T };

export type MembershipResult<T = undefined> =
	| MembershipSuccess<T>
	| { ok: false; reason: MembershipFailure };

type ProjectMembershipInput = {
	projectId: string;
};

type AddProjectCollaboratorInput = ProjectMembershipInput & {
	email: string;
	readOnly: boolean;
};

type UpdateProjectCollaboratorInput = ProjectMembershipInput & {
	userId: string;
	readOnly: boolean;
};

type RemoveProjectCollaboratorInput = ProjectMembershipInput & {
	userId: string;
};

export function listProjectCollaborators(projectId: string): ProjectCollaborator[] {
	return getCollaboratorsByProjectId(projectId);
}

export function addProjectCollaborator(input: AddProjectCollaboratorInput): MembershipResult {
	// User enumeration risk accepted: private OIDC-only deployment where all users
	// are known within the organisation.
	const user = getUserByEmail(input.email);
	if (!user) {
		return { ok: false, reason: "user-not-found" };
	}
	if (getCollaborator(input.projectId, user.userId)) {
		return { ok: false, reason: "already-collaborator" };
	}

	addCollaborator(input.projectId, user.userId, input.readOnly);
	return { ok: true };
}

export function updateProjectCollaborator(input: UpdateProjectCollaboratorInput): MembershipResult {
	const collaborator = getCollaborator(input.projectId, input.userId);
	if (!collaborator) {
		return { ok: false, reason: "collaborator-not-found" };
	}

	updateCollaborator(input.projectId, input.userId, input.readOnly);
	if (collaborator.readOnly !== input.readOnly) {
		closeProjectCollaboratorConnections(input.projectId, input.userId);
	}
	return { ok: true };
}

export function removeProjectCollaborator(input: RemoveProjectCollaboratorInput): MembershipResult {
	removeCollaborator(input.projectId, input.userId);
	closeProjectCollaboratorConnections(input.projectId, input.userId);
	return { ok: true };
}
