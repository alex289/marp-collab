import { db } from "../db.ts";

export type ProjectMembership = {
	projectId: string;
	userId: string;
	readOnly: boolean;
	sharedAt: Date;
};

export type ProjectOwner = {
	userId: string;
	userName: string;
	userImage: string | null;
};

export type ProjectCollaborator = ProjectMembership & {
	userName: string;
	userImage: string | null;
};

type CollaboratorCandidate = {
	name: string;
	email: string;
};

export type SharedProject = ProjectCollaborator & {
	projectName: string;
	projectCreatedAt: Date;
	updatedAt: Date;
	ownerName: string;
};

type ProjectMembershipRow = {
	projectId: string;
	userId: string;
	readOnly: number;
	sharedAt: string;
};

type ProjectOwnerRow = ProjectOwner;

type ProjectCollaboratorRow = ProjectMembershipRow & {
	userName: string;
	userImage: string | null;
};

type SharedProjectRow = ProjectCollaboratorRow & {
	projectName: string;
	projectCreatedAt: string;
	updatedAt: string;
	ownerName: string;
};

function rowToProjectMembership(row: ProjectMembershipRow): ProjectMembership {
	return {
		projectId: row.projectId,
		userId: row.userId,
		readOnly: row.readOnly === 1,
		sharedAt: new Date(row.sharedAt),
	};
}

function rowToProjectCollaborator(row: ProjectCollaboratorRow): ProjectCollaborator {
	return {
		...rowToProjectMembership(row),
		userName: row.userName,
		userImage: row.userImage,
	};
}

function rowToSharedProject(row: SharedProjectRow): SharedProject {
	return {
		...rowToProjectCollaborator(row),
		projectName: row.projectName,
		projectCreatedAt: new Date(row.projectCreatedAt),
		updatedAt: new Date(row.updatedAt),
		ownerName: row.ownerName,
	};
}

function normalizeSearchText(text: string): string {
	return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

db.function("normalize_collaborator_search", { deterministic: true }, normalizeSearchText);

const preparedStatements = {
	searchCollaboratorCandidates: db.prepare(`
		select u.name, u.email
		from user u
		join project p on p.id = @projectId
		where u.id <> p.ownerId
			and not exists (
				select 1 from project_collaborator pc
				where pc.projectId = p.id and pc.userId = u.id
			)
			and (
				instr(normalize_collaborator_search(u.name), @query) > 0
				or instr(lower(u.email), @query) > 0
			)
		order by instr(normalize_collaborator_search(u.name), @query) = 1 desc,
			instr(normalize_collaborator_search(u.name), @query) > 0 desc,
			normalize_collaborator_search(u.name), u.email
		limit 8
	`),
	getProjectOwnerByProjectId: db.prepare(`
		select owner.id as userId, owner.name as userName, owner.image as userImage
		from project p
		join user owner on p.ownerId = owner.id
		where p.id = ?
	`),
	getCollaboratorsByProjectId: db.prepare(`
		select pc.projectId, pc.userId, pc.readOnly, pc.createdAt as sharedAt,
			u.name as userName, u.image as userImage
        from project_collaborator pc
		join user u on pc.userId = u.id
		where pc.projectId = ?
        order by pc.createdAt asc
    `),
	getCollaborationsByUserId: db.prepare(`
		select projectId, userId, readOnly, pc.createdAt as sharedAt, p.createdAt as projectCreatedAt, p.updatedAt, u.name as userName, u.image as userImage, p.name as projectName, owner.name as ownerName
		from project_collaborator pc
		join user u on userId = u.id
		join project p on projectId = p.id
		join user owner on p.ownerId = owner.id
		where userId = ?
		order by pc.createdAt asc
    `),
	getCollaborator: db.prepare(`
		select projectId, userId, readOnly, createdAt as sharedAt
        from project_collaborator
        where projectId = ? and userId = ?
    `),
	addCollaborator: db.prepare(`
        insert into project_collaborator (projectId, userId, readOnly, createdAt)
        values (?, ?, ?, ?)
    `),
	updateCollaborator: db.prepare(`
        update project_collaborator
        set readOnly = ?
        where projectId = ? and userId = ?
    `),
	removeCollaborator: db.prepare(`
        delete from project_collaborator
        where projectId = ? and userId = ?
    `),
};

export function searchCollaboratorCandidates(
	projectId: string,
	query: string,
): CollaboratorCandidate[] {
	const normalizedQuery = normalizeSearchText(query).trim();
	if (normalizedQuery.length < 2) {
		return [];
	}

	return preparedStatements.searchCollaboratorCandidates.all({
		projectId,
		query: normalizedQuery,
	}) as CollaboratorCandidate[];
}

export function getProjectOwnerByProjectId(projectId: string): ProjectOwner | undefined {
	return preparedStatements.getProjectOwnerByProjectId.get(projectId) as
		| ProjectOwnerRow
		| undefined;
}

export function getCollaboratorsByProjectId(projectId: string): ProjectCollaborator[] {
	const rows = preparedStatements.getCollaboratorsByProjectId.all(
		projectId,
	) as ProjectCollaboratorRow[];
	return rows.map(rowToProjectCollaborator);
}

export function getCollaborationsByUserId(userId: string): SharedProject[] {
	const rows = preparedStatements.getCollaborationsByUserId.all(userId) as SharedProjectRow[];
	return rows.map(rowToSharedProject);
}

export function getCollaborator(projectId: string, userId: string): ProjectMembership | undefined {
	const row = preparedStatements.getCollaborator.get(projectId, userId) as
		| ProjectMembershipRow
		| undefined;
	if (!row) {
		return undefined;
	}
	return rowToProjectMembership(row);
}

export function addCollaborator(projectId: string, userId: string, readOnly: boolean) {
	return preparedStatements.addCollaborator.run(
		projectId,
		userId,
		readOnly ? 1 : 0,
		new Date().toISOString(),
	);
}

export function updateCollaborator(projectId: string, userId: string, readOnly: boolean) {
	return preparedStatements.updateCollaborator.run(readOnly ? 1 : 0, projectId, userId);
}

export function removeCollaborator(projectId: string, userId: string) {
	return preparedStatements.removeCollaborator.run(projectId, userId);
}
