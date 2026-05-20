import type { authClient } from "./auth-client";

export type DeckFile = {
	id: string;
	label: string;
	type: "markdown" | "asset";
	documentName?: string;
};

export type PresenceUser = {
	userId: string;
	userName: string;
	color: string;
};

export type SessionUser = typeof authClient.$Infer.Session.user;

export type Project = {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	ownerId: string;
};
