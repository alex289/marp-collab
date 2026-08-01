import { API_URL } from "../../lib/config.ts";
import type { DeckFile } from "../../lib/types.ts";
import type { RenameResult } from "./file-reconciliation.ts";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function getProjectFilesErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export type UploadProjectFilesResult = {
	uploadedAny: boolean;
	uploadedFiles: DeckFile[];
	failures: string[];
};

export interface ProjectFilesClient {
	list(projectId: string): Promise<DeckFile[]>;
	createFile(projectId: string, name: string): Promise<void>;
	createFolder(projectId: string, name: string): Promise<void>;
	upload(projectId: string, files: File[], destination?: string): Promise<UploadProjectFilesResult>;
	delete(projectId: string, file: DeckFile): Promise<void>;
	rename(projectId: string, file: DeckFile, name: string): Promise<RenameResult>;
	move(projectId: string, fileId: string, destination: string): Promise<{ newFileId: string }>;
	fileUrl(projectId: string, fileId: string): string;
	exportUrl(projectId: string): string;
}

export function createProjectFilesClient(fetcher: FetchLike = fetch): ProjectFilesClient {
	return {
		async list(projectId) {
			const response = await fetcher(`${API_URL}/projects/${projectId}/files`, {});
			if (!response.ok) {
				throw new Error(await readErrorMessage(response, "Could not load files"));
			}

			const payload = (await response.json()) as { files: DeckFile[] };
			return payload.files;
		},

		async createFile(projectId, name) {
			const response = await fetcher(`${API_URL}/projects/${projectId}/files`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			await ensureSuccessful(response, "Failed to create file");
		},

		async createFolder(projectId, name) {
			const response = await fetcher(`${API_URL}/projects/${projectId}/folders`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			await ensureSuccessful(response, "Failed to create folder");
		},

		async upload(projectId, files, destination) {
			let uploadedAny = false;
			const uploadedFiles: DeckFile[] = [];
			const failures: string[] = [];

			for (const file of files) {
				try {
					const formData = new FormData();
					formData.append("file", file);
					if (destination) {
						formData.append("destination", destination);
					}

					const response = await fetcher(`${API_URL}/projects/${projectId}/files/upload`, {
						method: "POST",
						body: formData,
					});

					if (!response.ok) {
						failures.push(
							`${file.name}: ${await readErrorMessage(response, "Failed to upload file")}`,
						);
						continue;
					}

					const payload = (await response.json()) as { file: DeckFile };
					uploadedFiles.push(payload.file);
					uploadedAny = true;
				} catch {
					failures.push(`${file.name}: An unexpected error occurred`);
				}
			}

			return { uploadedAny, uploadedFiles, failures };
		},

		async delete(projectId, file) {
			const endpoint =
				file.type === "folder"
					? `${API_URL}/projects/${projectId}/folders/${encodeURIComponent(file.id)}`
					: `${API_URL}/projects/${projectId}/files/${encodeURIComponent(file.id)}`;
			const response = await fetcher(endpoint, { method: "DELETE" });
			await ensureSuccessful(response, "Failed to delete file");
		},

		async rename(projectId, file, name) {
			const endpoint =
				file.type === "folder"
					? `${API_URL}/projects/${projectId}/folders/${encodeURIComponent(file.id)}/rename`
					: `${API_URL}/projects/${projectId}/files/rename/${encodeURIComponent(file.id)}`;
			const response = await fetcher(endpoint, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!response.ok) {
				throw new Error(await readErrorMessage(response, "Failed to rename item"));
			}

			const data = (await response.json()) as {
				newFileId?: string;
				newFolderPath?: string;
			};

			if (file.type === "folder" && data.newFolderPath) {
				return {
					type: "folder",
					oldFolderPath: file.id,
					newFolderPath: data.newFolderPath,
				};
			}

			if (data.newFileId) {
				return { type: "file", oldFileId: file.id, newFileId: data.newFileId };
			}

			throw new Error("Rename response was missing the new name.");
		},

		async move(projectId, fileId, destination) {
			const response = await fetcher(
				`${API_URL}/projects/${projectId}/files/${encodeURIComponent(fileId)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ destination }),
				},
			);
			await ensureSuccessful(response, "Failed to move file");
			return (await response.json()) as { newFileId: string };
		},

		fileUrl(projectId, fileId) {
			return `${API_URL}/projects/${projectId}/files/${fileId
				.split("/")
				.map(encodeURIComponent)
				.join("/")}`;
		},

		exportUrl(projectId) {
			return `${API_URL}/projects/${projectId}/export.zip`;
		},
	};
}

export const projectFilesClient = createProjectFilesClient();

async function ensureSuccessful(response: Response, fallbackMessage: string): Promise<void> {
	if (response.ok) {
		return;
	}

	throw new Error(await readErrorMessage(response, fallbackMessage));
}

const MAX_ERROR_TEXT_LENGTH = 300;

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
	const body = await response.text().catch(() => "");

	try {
		const data = JSON.parse(body) as { error?: unknown; message?: unknown };
		for (const message of [data.error, data.message]) {
			if (typeof message === "string" && message.length > 0) {
				return message;
			}
		}
	} catch {
		// Body is not JSON — fall through to the raw response text.
	}

	const text = body.trim();
	if (text.length === 0) {
		return `${fallbackMessage} (HTTP ${response.status})`;
	}

	return text.length > MAX_ERROR_TEXT_LENGTH ? `${text.slice(0, MAX_ERROR_TEXT_LENGTH)}…` : text;
}
