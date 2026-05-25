import { collabServer } from "./hocuspocus.ts";

export function broadcastFilesChanged(projectId: string): void {
	for (const [documentName, document] of collabServer.documents) {
		if (documentName.startsWith(`project/${projectId}/`)) {
			document.broadcastStateless("files-changed");
		}
	}
}
