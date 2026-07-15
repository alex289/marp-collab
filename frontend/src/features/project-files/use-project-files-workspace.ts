import { useCallback, useEffect, useMemo, useState } from "react";
import type { Awareness } from "y-protocols/awareness.js";
import type { DeckFile } from "../../lib/types";
import { buildFileTree, getParentFolderPath, type FileTreeNode } from "./file-tree";
import {
	expandOpenFoldersForSelection,
	reconcileOpenFoldersAfterRename,
	reconcileSelectedFileAfterMove,
	reconcileSelectedFileAfterRename,
} from "./file-reconciliation";
import type { ProjectFilePresenceById } from "./project-file-presence";
import {
	projectFilesClient,
	type ProjectFilesClient,
	type UploadProjectFilesResult,
} from "./project-files-client";
import {
	emptyProjectFilesDragState,
	endProjectFileDrag,
	setProjectFileDragOver,
	startProjectFileDrag,
	type ProjectFilesDragState,
} from "./project-files-workspace-state";
import { useProjectFilePresence } from "./use-project-file-presence";

type UseProjectFilesWorkspaceOptions = {
	projectId: string;
	selectedFile: DeckFile | null;
	onSelectFile: (file: DeckFile) => void;
	presenceAwareness: Awareness | null;
	currentUserId: string | null;
	client?: ProjectFilesClient;
};

export type ProjectFilesWorkspace = {
	projectId: string;
	files: DeckFile[];
	tree: FileTreeNode[];
	isLoading: boolean;
	error: string | null;
	reload: () => Promise<void>;
	selectedFileId: string | null;
	selectFile: (file: DeckFile) => void;
	openFolders: Record<string, boolean>;
	setFolderOpen: (path: string, open: boolean) => void;
	presenceByFileId: ProjectFilePresenceById;
	dragState: ProjectFilesDragState;
	dropUploadDragOverPath: string | null;
	isUploadingDrop: boolean;
	dropUploadError: string | null;
	startDrag: (fileId: string) => void;
	endDrag: () => void;
	setDragOverPath: (path: string | null) => void;
	setDropUploadDragOverPath: (path: string | null) => void;
	createFile: (name: string) => Promise<void>;
	createFolder: (name: string) => Promise<void>;
	uploadFiles: (files: File[], destination?: string) => Promise<UploadProjectFilesResult>;
	uploadDroppedFiles: (files: File[], destination?: string) => Promise<void>;
	deleteFile: (file: DeckFile) => Promise<void>;
	renameFile: (file: DeckFile, name: string) => Promise<void>;
	moveFile: (fileId: string, destination: string) => Promise<void>;
	fileUrl: (fileId: string) => string;
	exportUrl: () => string;
};

export function useProjectFilesWorkspace({
	projectId,
	selectedFile,
	onSelectFile,
	presenceAwareness,
	currentUserId,
	client = projectFilesClient,
}: UseProjectFilesWorkspaceOptions): ProjectFilesWorkspace {
	const [files, setFiles] = useState<DeckFile[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
	const [dragState, setDragState] = useState<ProjectFilesDragState>(emptyProjectFilesDragState);
	const [dropUploadDragOverPath, setDropUploadDragOverPath] = useState<string | null>(null);
	const [isUploadingDrop, setIsUploadingDrop] = useState(false);
	const [dropUploadError, setDropUploadError] = useState<string | null>(null);
	const tree = useMemo(() => buildFileTree(files), [files]);
	const presenceByFileId = useProjectFilePresence(presenceAwareness, currentUserId);

	const reload = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			setFiles(await client.list(projectId));
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : "Unknown error");
		} finally {
			setIsLoading(false);
		}
	}, [client, projectId]);

	useEffect(() => {
		void reload();
	}, [reload]);

	useEffect(() => {
		setOpenFolders((previous) => expandOpenFoldersForSelection(previous, selectedFile?.id ?? null));
	}, [selectedFile?.id]);

	const selectFile = useCallback(
		(file: DeckFile) => {
			onSelectFile(file);
		},
		[onSelectFile],
	);

	const setFolderOpen = useCallback((path: string, open: boolean) => {
		setOpenFolders((previous) => {
			if ((previous[path] ?? false) === open) {
				return previous;
			}

			return { ...previous, [path]: open };
		});
	}, []);

	const startDrag = useCallback((fileId: string) => {
		setDragState(startProjectFileDrag(fileId));
	}, []);

	const endDrag = useCallback(() => {
		setDragState(endProjectFileDrag());
	}, []);

	const setDragOverPath = useCallback((path: string | null) => {
		setDragState((previous) => setProjectFileDragOver(previous, path));
	}, []);

	const createFile = useCallback(
		async (name: string) => {
			await client.createFile(projectId, name);
			await reload();
		},
		[client, projectId, reload],
	);

	const createFolder = useCallback(
		async (name: string) => {
			await client.createFolder(projectId, name);
			await reload();
		},
		[client, projectId, reload],
	);

	const uploadFiles = useCallback(
		async (nextFiles: File[], destination?: string) => {
			const result = await client.upload(projectId, nextFiles, destination);
			if (result.uploadedAny) {
				await reload();
			}
			return result;
		},
		[client, projectId, reload],
	);

	const uploadDroppedFiles = useCallback(
		async (nextFiles: File[], destination?: string) => {
			setDropUploadDragOverPath(null);
			setDropUploadError(null);
			setIsUploadingDrop(true);

			try {
				const { failures } = await uploadFiles(nextFiles, destination);
				if (failures.length > 0) {
					setDropUploadError(failures.join("\n"));
				}
			} finally {
				setIsUploadingDrop(false);
			}
		},
		[uploadFiles],
	);

	const deleteFile = useCallback(
		async (file: DeckFile) => {
			await client.delete(projectId, file);
			await reload();
		},
		[client, projectId, reload],
	);

	const renameFile = useCallback(
		async (file: DeckFile, name: string) => {
			const result = await client.rename(projectId, file, name);
			const reconciledFile = reconcileSelectedFileAfterRename(projectId, selectedFile, result);
			if (reconciledFile && reconciledFile !== selectedFile) {
				onSelectFile(reconciledFile);
			}
			setOpenFolders((previous) => reconcileOpenFoldersAfterRename(previous, result));
			await reload();
		},
		[client, onSelectFile, projectId, reload, selectedFile],
	);

	const moveFile = useCallback(
		async (fileId: string, destination: string) => {
			setDragState(endProjectFileDrag());
			if (getParentFolderPath(fileId) === destination) {
				return;
			}

			try {
				const { newFileId } = await client.move(projectId, fileId, destination);
				const reconciledFile = reconcileSelectedFileAfterMove(
					projectId,
					selectedFile,
					fileId,
					newFileId,
				);
				if (reconciledFile && reconciledFile !== selectedFile) {
					onSelectFile(reconciledFile);
				}
				await reload();
			} catch {
				return;
			}
		},
		[client, onSelectFile, projectId, reload, selectedFile],
	);

	const fileUrl = useCallback(
		(fileId: string) => client.fileUrl(projectId, fileId),
		[client, projectId],
	);
	const exportUrl = useCallback(() => client.exportUrl(projectId), [client, projectId]);

	return {
		projectId,
		files,
		tree,
		isLoading,
		error,
		reload,
		selectedFileId: selectedFile?.id ?? null,
		selectFile,
		openFolders,
		setFolderOpen,
		presenceByFileId,
		dragState,
		dropUploadDragOverPath,
		isUploadingDrop,
		dropUploadError,
		startDrag,
		endDrag,
		setDragOverPath,
		setDropUploadDragOverPath,
		createFile,
		createFolder,
		uploadFiles,
		uploadDroppedFiles,
		deleteFile,
		renameFile,
		moveFile,
		fileUrl,
		exportUrl,
	};
}
