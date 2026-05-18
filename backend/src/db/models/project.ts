import { db } from "../db.ts";

export type Project = {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	ownerId: string;
};

type ProjectRow = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	ownerId: string;
};

function rowToProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
		ownerId: row.ownerId,
	};
}

const preparedStatements = {
	getProjectById: db.prepare(`
        select id, name, createdAt, updatedAt, ownerId
        from project
        where id = ?
    `),
	getProjectsByOwnerId: db.prepare(`
        select id, name, createdAt, updatedAt, ownerId
        from project
        where ownerId = ?
        order by createdAt desc
    `),
	createProject: db.prepare(`
        insert into project (id, name, createdAt, updatedAt, ownerId)
        values (?, ?, ?, ?, ?)
    `),
	updateProject: db.prepare(`
        update project
        set name = ?, updatedAt = ?
        where id = ?
    `),
	deleteProject: db.prepare(`
        delete from project
        where id = ?
    `),
};

export function getProjectById(projectId: string): Project | undefined {
	const row = preparedStatements.getProjectById.get(projectId) as ProjectRow | undefined;
	if (!row) {
		return undefined;
	}
	return rowToProject(row);
}

export function getProjectsByOwnerId(ownerId: string): Project[] {
	const rows = preparedStatements.getProjectsByOwnerId.all(ownerId) as ProjectRow[];
	return rows.map(rowToProject);
}

export function createProject(project: Omit<Project, "createdAt" | "updatedAt">) {
	const now = new Date();
	return preparedStatements.createProject.run(project.id, project.name, now, now, project.ownerId);
}

export function updateProject(project: Pick<Project, "id" | "name">) {
	return preparedStatements.updateProject.run(project.name, new Date(), project.id);
}

export function deleteProject(projectId: string) {
	return preparedStatements.deleteProject.run(projectId);
}
