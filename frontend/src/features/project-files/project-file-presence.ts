export type ProjectFilePresenceParticipant = {
	id: string;
	name: string;
	color: string;
	image: string | null;
};

export type ProjectFilePresenceById = Record<string, ProjectFilePresenceParticipant[]>;

export function getProjectFilePresenceById(
	states: Iterable<unknown>,
	currentUserId: string | null,
): ProjectFilePresenceById {
	const participantsByFile = new Map<string, Map<string, ProjectFilePresenceParticipant>>();

	for (const state of states) {
		const stateFields = state as { user?: unknown; activeFile?: unknown };
		const participant = parsePresenceParticipant(stateFields.user);
		const fileId = parseActiveFileId(stateFields.activeFile);
		if (!participant || !fileId || participant.id === currentUserId) {
			continue;
		}

		let fileParticipants = participantsByFile.get(fileId);
		if (!fileParticipants) {
			fileParticipants = new Map();
			participantsByFile.set(fileId, fileParticipants);
		}
		fileParticipants.set(participant.id, participant);
	}

	const presenceByFileId: ProjectFilePresenceById = {};
	for (const [fileId, participants] of participantsByFile.entries()) {
		presenceByFileId[fileId] = Array.from(participants.values()).sort((left, right) =>
			left.name === right.name
				? left.id.localeCompare(right.id)
				: left.name.localeCompare(right.name),
		);
	}

	return presenceByFileId;
}

function parsePresenceParticipant(value: unknown): ProjectFilePresenceParticipant | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const user = value as Partial<ProjectFilePresenceParticipant>;
	if (typeof user.id !== "string" || user.id.length === 0) {
		return null;
	}

	return {
		id: user.id,
		name: typeof user.name === "string" && user.name.length > 0 ? user.name : "Unknown",
		color: typeof user.color === "string" && user.color.length > 0 ? user.color : "#0ea5e9",
		image: typeof user.image === "string" && user.image.length > 0 ? user.image : null,
	};
}

function parseActiveFileId(value: unknown): string | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const activeFile = value as { fileId?: unknown };
	return typeof activeFile.fileId === "string" && activeFile.fileId.length > 0
		? activeFile.fileId
		: null;
}
