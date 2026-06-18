type ClosableConnection = {
	close(): void;
};

type ProjectConnection = {
	userId: string;
	connection: ClosableConnection;
	projectRefs: Map<string, number>;
};

const projectConnectionsBySocketId = new Map<string, ProjectConnection>();

function getProjectId(documentName: string): string | undefined {
	const parts = documentName.split("/");
	if (parts[0] !== "project" || !parts[1]) {
		return undefined;
	}

	return parts[1];
}

export function registerProjectConnection({
	socketId,
	documentName,
	userId,
	connection,
}: {
	socketId: string;
	documentName: string;
	userId: string;
	connection: ClosableConnection;
}) {
	const projectId = getProjectId(documentName);
	if (!projectId) {
		return;
	}

	const existingConnection = projectConnectionsBySocketId.get(socketId);
	if (existingConnection) {
		existingConnection.projectRefs.set(
			projectId,
			(existingConnection.projectRefs.get(projectId) ?? 0) + 1,
		);
		return;
	}

	projectConnectionsBySocketId.set(socketId, {
		userId,
		connection,
		projectRefs: new Map([[projectId, 1]]),
	});
}

export function unregisterProjectConnection(socketId: string, documentName?: string) {
	if (!documentName) {
		projectConnectionsBySocketId.delete(socketId);
		return;
	}

	const projectId = getProjectId(documentName);
	const projectConnection = projectConnectionsBySocketId.get(socketId);
	if (!projectId || !projectConnection) {
		return;
	}

	const nextRefCount = (projectConnection.projectRefs.get(projectId) ?? 0) - 1;
	if (nextRefCount > 0) {
		projectConnection.projectRefs.set(projectId, nextRefCount);
		return;
	}

	projectConnection.projectRefs.delete(projectId);
	if (projectConnection.projectRefs.size === 0) {
		projectConnectionsBySocketId.delete(socketId);
	}
}

export function closeProjectCollaboratorConnections(projectId: string, userId: string): number {
	const connectionsToClose: Array<[string, ProjectConnection]> = [];

	for (const [socketId, projectConnection] of projectConnectionsBySocketId) {
		if (projectConnection.userId === userId && projectConnection.projectRefs.has(projectId)) {
			connectionsToClose.push([socketId, projectConnection]);
		}
	}

	for (const [socketId, projectConnection] of connectionsToClose) {
		projectConnectionsBySocketId.delete(socketId);
		projectConnection.connection.close();
	}

	return connectionsToClose.length;
}
