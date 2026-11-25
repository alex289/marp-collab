import { extname } from "node:path";
import {
	createProjectFolder,
	deleteProjectContentFile,
	deleteProjectContentFolder,
	listProjectContent,
	moveProjectContentEntry,
	saveBinaryProjectFile,
} from "../projects/project-content.ts";
import { getMimeType, isAllowedUpload } from "../helpers/file-allowlist.ts";
import { isProjectFolderEmpty } from "../projects/storage.ts";
import { PresentationToolError, withProjectToolWrite } from "./presentations.ts";

export const MAX_MCP_ASSET_BYTES = 2 * 1024 * 1024;
export const MAX_MCP_ASSET_BASE64 = 4 * Math.ceil(MAX_MCP_ASSET_BYTES / 3);

export function isAtOrBelow(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

export function addFolder(projectId: string, userId: string, path: string) {
	return withProjectToolWrite(projectId, userId, async () => {
		try {
			await createProjectFolder(projectId, path);
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				["EEXIST", "ENOTDIR"].includes(String(error.code))
			) {
				throw new PresentationToolError("A file is blocking the folder path.");
			}
			throw error;
		}
		return { path };
	});
}

export function moveEntry(projectId: string, userId: string, path: string, destination: string) {
	return withProjectToolWrite(projectId, userId, async () => {
		const files = await listProjectContent(projectId);
		const entry = files.find((file) => file.id === path);
		if (!entry) {
			throw new PresentationToolError("Source file or folder not found. List files and try again.");
		}
		const kind = entry.type === "folder" ? "dir" : "file";
		if (kind === "file" && extname(path).toLowerCase() !== extname(destination).toLowerCase()) {
			throw new PresentationToolError("Keep the file's existing extension.");
		}
		const moved = await moveProjectContentEntry(projectId, path, destination, kind);
		if (!moved.ok) {
			throw new PresentationToolError(
				"Cannot move the entry. Check that the destination folder exists, the path is free, and the entry is not moving into itself.",
			);
		}
		return { path, newPath: moved.id };
	});
}

export function deleteEntry(
	projectId: string,
	userId: string,
	path: string,
	recursive: boolean,
	dryRun: boolean,
) {
	return withProjectToolWrite(projectId, userId, async () => {
		const files = await listProjectContent(projectId);
		const entry = files.find((file) => file.id === path);
		if (!entry) {
			throw new PresentationToolError("File or folder not found. List files and try again.");
		}
		const folder = entry.type === "folder";
		const affectedPaths = folder
			? files.filter((file) => isAtOrBelow(file.id, path)).map((file) => file.id)
			: [path];
		if (dryRun) {
			return {
				path,
				affectedPaths,
				deleted: false,
				requiresRecursive:
					folder && (affectedPaths.length > 1 || !(await isProjectFolderEmpty(projectId, path))),
			};
		}
		try {
			const deletion = folder
				? await deleteProjectContentFolder(projectId, path, recursive)
				: await deleteProjectContentFile(projectId, path);
			if (!deletion.ok) {
				throw new PresentationToolError("File or folder no longer exists.");
			}
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOTEMPTY") {
				throw new PresentationToolError(
					"Folder is not empty. Review a dry run and set recursive to delete its contents.",
				);
			}
			throw error;
		}
		return { path, affectedPaths, deleted: true };
	});
}

export function uploadAsset(projectId: string, userId: string, path: string, base64: string) {
	return withProjectToolWrite(projectId, userId, async () => {
		const mimeType = getMimeType(path);
		if (
			mimeType === "text/css" ||
			mimeType === "text/markdown" ||
			!isAllowedUpload(path, mimeType)
		) {
			throw new PresentationToolError("Use an allowed image, video or font extension.");
		}
		const data = Buffer.from(base64, "base64");
		if (!data.length || data.length > MAX_MCP_ASSET_BYTES || data.toString("base64") !== base64) {
			throw new PresentationToolError("Provide a non-empty standard base64 asset of up to 2 MiB.");
		}
		try {
			const file = await saveBinaryProjectFile(projectId, path, data, "wx");
			return { file, mimeType, size: data.length };
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				["EEXIST", "EISDIR", "ENOTDIR"].includes(String(error.code))
			) {
				throw new PresentationToolError("Path conflicts with an existing file or folder.");
			}
			throw error;
		}
	});
}
