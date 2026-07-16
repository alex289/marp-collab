import { collabServer } from "./hocuspocus.ts";
import { documentBelongsToProject } from "../projects/document-identity.ts";

export function broadcastFilesChanged(projectId: string): void {
	for (const [documentName, document] of collabServer.documents) {
		if (documentBelongsToProject(documentName, projectId)) {
			document.broadcastStateless("files-changed");
		}
	}
}
