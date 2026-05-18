import { db } from "../db.ts";

export type ProjectCollaborator = {
	projectId: string;
	userId: string;
	readOnly: boolean;
	createdAt: Date;
};

type ProjectCollaboratorRow = {
	projectId: string;
	userId: string;
	readOnly: number;
	createdAt: string;
};

function rowToProjectCollaborator(row: ProjectCollaboratorRow): ProjectCollaborator {
	return {
		projectId: row.projectId,
		userId: row.userId,
		readOnly: row.readOnly === 1,
		createdAt: new Date(row.createdAt),
	};
}

const preparedStatements = {
	getCollaboratorsByProjectId: db.prepare(`
        select projectId, userId, readOnly, createdAt
        from project_collaborator
        where projectId = ?
        order by createdAt asc
    `),
	getCollaborationsByUserId: db.prepare(`
        select projectId, userId, readOnly, createdAt
        from project_collaborator
        where userId = ?
        order by createdAt asc
    `),
	getCollaborator: db.prepare(`
        select projectId, userId, readOnly, createdAt
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

export function getCollaboratorsByProjectId(projectId: string): ProjectCollaborator[] {
	const rows = preparedStatements.getCollaboratorsByProjectId.all(
		projectId,
	) as ProjectCollaboratorRow[];
	return rows.map(rowToProjectCollaborator);
}

export function getCollaborationsByUserId(userId: string): ProjectCollaborator[] {
	const rows = preparedStatements.getCollaborationsByUserId.all(userId) as ProjectCollaboratorRow[];
	return rows.map(rowToProjectCollaborator);
}

export function getCollaborator(
	projectId: string,
	userId: string,
): ProjectCollaborator | undefined {
	const row = preparedStatements.getCollaborator.get(projectId, userId) as
		| ProjectCollaboratorRow
		| undefined;
	if (!row) {
		return undefined;
	}
	return rowToProjectCollaborator(row);
}

export function addCollaborator(collaborator: Omit<ProjectCollaborator, "createdAt">) {
	return preparedStatements.addCollaborator.run(
		collaborator.projectId,
		collaborator.userId,
		collaborator.readOnly ? 1 : 0,
		new Date().toISOString(),
	);
}

export function updateCollaborator(projectId: string, userId: string, readOnly: boolean) {
	return preparedStatements.updateCollaborator.run(readOnly ? 1 : 0, projectId, userId);
}

export function removeCollaborator(projectId: string, userId: string) {
	return preparedStatements.removeCollaborator.run(projectId, userId);
}
