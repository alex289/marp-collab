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
import { getProjectAuthorization } from "./access-policy.ts";

export type MembershipFailure =
	| "access-denied"
	| "owner-required"
	| "user-not-found"
	| "already-collaborator"
	| "collaborator-not-found";

type MembershipSuccess<T> = [T] extends [undefined] ? { ok: true } : { ok: true; value: T };

export type MembershipResult<T = undefined> =
	| MembershipSuccess<T>
	| { ok: false; reason: MembershipFailure };

type MembershipActorInput = {
	projectId: string;
	actorUserId: string;
};

type AddProjectCollaboratorInput = MembershipActorInput & {
	email: string;
	readOnly: boolean;
};

type UpdateProjectCollaboratorInput = MembershipActorInput & {
	userId: string;
	readOnly: boolean;
};

type RemoveProjectCollaboratorInput = MembershipActorInput & {
	userId: string;
};

function getManagementAuthorization({
	projectId,
	actorUserId,
}: MembershipActorInput): MembershipFailure | undefined {
	const authorization = getProjectAuthorization(projectId, actorUserId, "manage");
	if (authorization.allowed) {
		return undefined;
	}
	return authorization.reason === "no-access" ? "access-denied" : "owner-required";
}

export function listProjectCollaborators(
	projectId: string,
	actorUserId: string,
): MembershipResult<ProjectCollaborator[]> {
	const authorization = getProjectAuthorization(projectId, actorUserId, "read");
	if (!authorization.allowed) {
		return { ok: false, reason: "access-denied" };
	}
	return { ok: true, value: getCollaboratorsByProjectId(projectId) };
}

export function addProjectCollaborator(input: AddProjectCollaboratorInput): MembershipResult {
	const authorizationFailure = getManagementAuthorization(input);
	if (authorizationFailure) {
		return { ok: false, reason: authorizationFailure };
	}

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
	const authorizationFailure = getManagementAuthorization(input);
	if (authorizationFailure) {
		return { ok: false, reason: authorizationFailure };
	}

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
	const authorizationFailure = getManagementAuthorization(input);
	if (authorizationFailure) {
		return { ok: false, reason: authorizationFailure };
	}

	removeCollaborator(input.projectId, input.userId);
	closeProjectCollaboratorConnections(input.projectId, input.userId);
	return { ok: true };
}
