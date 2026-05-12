export type DeckFile = {
	id: string;
	label: string;
	documentName: string;
};

export type SessionUser = {
	id: string;
	name: string;
	email: string;
};

export type PresenceUser = {
	userId: string;
	userName: string;
	color: string;
};
