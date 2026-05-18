import { db } from "../db.ts";

function up() {
	db.exec(`
        create table if not exists "project" (
            "id" text not null primary key,
            "name" text not null,
            "createdAt" date not null,
            "updatedAt" date not null,
            "ownerId" text not null references "user" ("id") on delete cascade
        );
        create table if not exists "project_collaborator" (
            "projectId" text not null references "project" ("id") on delete cascade,
            "userId" text not null references "user" ("id") on delete cascade,
            "readOnly" integer not null,
            "createdAt" date not null,
            primary key ("projectId", "userId")
        );
        `);
}

export default {
	name: "002_projects",
	up,
};
