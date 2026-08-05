import type { authClient } from "./auth-client";

export type DeckFile = {
	id: string;
	label: string;
	type: "markdown" | "asset" | "folder";
	documentName?: string;
};

export type PresenceUser = {
	userId: string;
	userName: string;
	color: string;
	image: string | null;
};

export type SessionUser = typeof authClient.$Infer.Session.user;

export type Project = {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	ownerId: string;
};

export type ProjectOwner = {
	userId: string;
	userName: string;
	userImage: string | null;
};

export type SharedProject = {
	projectId: string;
	projectName: string;
	userId: string;
	readOnly: boolean;
	sharedAt: Date;
	projectCreatedAt: Date;
	updatedAt: Date;
	userName: string;
	userImage: string | null;
	ownerName: string;
};

export type ProjectCollaboratorsResponse = {
	owner: ProjectOwner;
	collaborators: SharedProject[];
};
