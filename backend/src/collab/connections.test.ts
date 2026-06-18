import { describe, test } from "node:test";
import { equal } from "node:assert/strict";
import {
	closeProjectCollaboratorConnections,
	registerProjectConnection,
	unregisterProjectConnection,
} from "./connections.ts";

const createConnection = () => {
	let closeCalls = 0;

	return {
		connection: {
			close() {
				closeCalls += 1;
			},
		},
		get closeCalls() {
			return closeCalls;
		},
	};
};

describe("collab connection registry", () => {
	test("closes only the removed collaborator's connections for the project", () => {
		const removedProjectConnection = createConnection();
		const removedProjectConnectionTwo = createConnection();
		const removedOtherProjectConnection = createConnection();
		const otherUserConnection = createConnection();

		registerProjectConnection({
			socketId: "socket-1",
			documentName: "project/project-1/presentation.md",
			userId: "user-1",
			connection: removedProjectConnection.connection,
		});
		registerProjectConnection({
			socketId: "socket-2",
			documentName: "project/project-1/notes.md",
			userId: "user-1",
			connection: removedProjectConnectionTwo.connection,
		});
		registerProjectConnection({
			socketId: "socket-3",
			documentName: "project/project-2/presentation.md",
			userId: "user-1",
			connection: removedOtherProjectConnection.connection,
		});
		registerProjectConnection({
			socketId: "socket-4",
			documentName: "project/project-1/presentation.md",
			userId: "user-2",
			connection: otherUserConnection.connection,
		});

		equal(closeProjectCollaboratorConnections("project-1", "user-1"), 2);
		equal(removedProjectConnection.closeCalls, 1);
		equal(removedProjectConnectionTwo.closeCalls, 1);
		equal(removedOtherProjectConnection.closeCalls, 0);
		equal(otherUserConnection.closeCalls, 0);

		equal(closeProjectCollaboratorConnections("project-1", "user-1"), 0);

		unregisterProjectConnection("socket-3");
		unregisterProjectConnection("socket-4");
	});

	test("closes a socket when any registered document belongs to the removed project", () => {
		const connection = createConnection();

		registerProjectConnection({
			socketId: "socket-5",
			documentName: "project/project-1/presentation.md",
			userId: "user-1",
			connection: connection.connection,
		});
		registerProjectConnection({
			socketId: "socket-5",
			documentName: "project/project-2/presentation.md",
			userId: "user-1",
			connection: connection.connection,
		});

		equal(closeProjectCollaboratorConnections("project-1", "user-1"), 1);
		equal(connection.closeCalls, 1);
	});
});
