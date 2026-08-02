import { db } from "../db.ts";

export type Project = {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	ownerId: string;
	ownerName: string;
	ownerImage: string | null;
};

type ProjectRow = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	ownerId: string;
	ownerName: string;
	ownerImage: string | null;
};

function rowToProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
		ownerId: row.ownerId,
		ownerName: row.ownerName,
		ownerImage: row.ownerImage,
	};
}

const preparedStatements = {
	getProjectById: db.prepare(`
		select p.id, p.name, p.createdAt, p.updatedAt, p.ownerId,
			owner.name as ownerName, owner.image as ownerImage
		from project p
		join user owner on p.ownerId = owner.id
		where p.id = ?
    `),
	getProjectsByOwnerId: db.prepare(`
		select p.id, p.name, p.createdAt, p.updatedAt, p.ownerId,
			owner.name as ownerName, owner.image as ownerImage
		from project p
		join user owner on p.ownerId = owner.id
		where p.ownerId = ?
		order by p.createdAt desc
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
        where id = ? and ownerId = ?
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

export function createProject(project: Pick<Project, "id" | "name" | "ownerId">) {
	const now = new Date().toISOString();
	return preparedStatements.createProject.run(project.id, project.name, now, now, project.ownerId);
}

export function updateProject(project: Pick<Project, "id" | "name">) {
	return preparedStatements.updateProject.run(project.name, new Date().toISOString(), project.id);
}

export function deleteProject(projectId: string, ownerId: string) {
	return preparedStatements.deleteProject.run(projectId, ownerId);
}
