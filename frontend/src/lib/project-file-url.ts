import { API_URL } from "./config.ts";

export function projectFilesUrl(projectId: string): string {
	return `${API_URL}/projects/${encodeURIComponent(projectId)}/files`;
}

export function projectFileUrl(projectId: string, fileId: string): string {
	return `${projectFilesUrl(projectId)}/${fileId.split("/").map(encodeURIComponent).join("/")}`;
}
