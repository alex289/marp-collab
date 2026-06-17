import { db } from "../db.ts";

export type User = {
	userId: string;
	name: string;
	email: string;
};

type UserRow = {
	id: string;
	name: string;
	email: string;
	emailVerified: number;
	image: string;
	createdAt: string;
	updatedAt: string;
};

function rowToUser(row: UserRow): User {
	return {
		userId: row.id,
		name: row.name,
		email: row.email,
	};
}

const preparedStatements = {
	getUserByEmail: db.prepare(`
        select id, name, email, emailVerified, image, createdAt, updatedAt
        from user
        where email = ?
    `),
};

export function getUserByEmail(email: string): User | undefined {
	const row = preparedStatements.getUserByEmail.get(email) as UserRow | undefined;
	if (!row) {
		return undefined;
	}
	return rowToUser(row);
}
