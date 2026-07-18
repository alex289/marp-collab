import { createContext, useContext, useRef } from "react";
import {
	ChevronRight,
	File,
	Folder,
	Image,
	Pencil,
	RefreshCw,
	Trash2,
	Type,
	Upload,
} from "lucide-react";
import type { DeckFile } from "../../lib/types";
import { isImageDeckFile } from "../../lib/file-types";
import { cn } from "../../lib/utils";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
} from "../../components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import type { FileTreeNode } from "./file-tree";
import type { ProjectFilePresenceParticipant } from "./project-file-presence";
import type { ProjectFilesWorkspace } from "./use-project-files-workspace";

type FileTreeViewProps = {
	workspace: ProjectFilesWorkspace;
	onPreviewImage: (file: DeckFile) => void;
	onDeleteFile: (file: DeckFile) => void;
	onRenameFile: (file: DeckFile) => void;
};

type FileTreeContextValue = Pick<
	ProjectFilesWorkspace,
	| "selectedFileId"
	| "selectFile"
	| "openFolders"
	| "setFolderOpen"
	| "presenceByFileId"
	| "dragState"
	| "dropUploadDragOverPath"
	| "startDrag"
	| "endDrag"
	| "setDragOverPath"
	| "moveFile"
> & {
	onPreviewImage: (file: DeckFile) => void;
	onDeleteFile: (file: DeckFile) => void;
	onRenameFile: (file: DeckFile) => void;
	onExternalFileDragOverPath: (event: React.DragEvent, path: string) => boolean;
	onExternalFileDragLeave: (event: React.DragEvent) => void;
	onExternalFileDropOnPath: (event: React.DragEvent, path: string) => boolean;
};

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

function useFileTreeContext(): FileTreeContextValue {
	const context = useContext(FileTreeContext);
	if (!context) {
		throw new Error("FileTreeItem must be rendered inside FileTreeView");
	}
	return context;
}

const MAX_FILE_PRESENCE_DOTS = 3;

function FilePresenceDots({
	participants,
	fileName,
}: {
	participants: ProjectFilePresenceParticipant[];
	fileName: string;
}) {
	if (participants.length === 0) {
		return null;
	}

	const visibleParticipants = participants.slice(0, MAX_FILE_PRESENCE_DOTS);
	const hiddenParticipants = Math.max(0, participants.length - visibleParticipants.length);
	const participantNames = participants.map((participant) => participant.name).join(", ");
	const label = `Users viewing ${fileName}: ${participantNames}`;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<div
						role="group"
						aria-label={label}
						className="absolute top-1/2 right-14 z-10 flex h-5 -translate-y-1/2 items-center gap-1 group-data-[collapsible=icon]:hidden mr-1"
					>
						{visibleParticipants.map((participant) => (
							<span
								key={participant.id}
								className="size-2.5 rounded-full ring-1 ring-sidebar"
								style={{ backgroundColor: participant.color }}
							/>
						))}
						{hiddenParticipants > 0 ? (
							<div className="relative flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground ring-1 ring-sidebar">
								+{hiddenParticipants}
							</div>
						) : null}
					</div>
				}
			/>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}

function FileTreeAction({
	label,
	onClick,
	className,
	children,
}: {
	label: string;
	onClick: () => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					// Nested menu items share the group/menu-item scope, so showOnHover
					// would reveal the actions of every row in a hovered folder subtree.
					// Scope the reveal to the row's own group/row wrapper instead. Use
					// :focus-visible rather than focus-within so a mouse click on the row
					// (which leaves focus on its button) doesn't pin the actions visible.
					<SidebarMenuAction
						onClick={onClick}
						aria-label={label}
						className={cn(
							"peer-data-active/menu-button:text-sidebar-accent-foreground group-has-[:focus-visible]/row:opacity-100 group-hover/row:opacity-100 md:opacity-0",
							className,
						)}
					>
						{children}
					</SidebarMenuAction>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function FileTreeItem({ node }: { node: FileTreeNode }) {
	const {
		selectedFileId,
		selectFile,
		openFolders,
		setFolderOpen,
		presenceByFileId,
		dragState,
		dropUploadDragOverPath,
		startDrag,
		endDrag,
		setDragOverPath,
		moveFile,
		onPreviewImage,
		onDeleteFile,
		onRenameFile,
		onExternalFileDragOverPath,
		onExternalFileDragLeave,
		onExternalFileDropOnPath,
	} = useFileTreeContext();
	const isFolder = node.children.length > 0 || node.file?.type === "folder";

	if (!isFolder) {
		if (!node.file) {
			return null;
		}

		const file = node.file;
		const isDragging = dragState.draggingFileId === file.id;
		const filePresence = presenceByFileId.get(file.id) ?? [];
		const dragProps = {
			draggable: true,
			onDragStart: (event: React.DragEvent) => {
				event.dataTransfer.effectAllowed = "move";
				startDrag(file.id);
			},
			onDragEnd: endDrag,
		};

		if (file.type === "asset") {
			const isFontFile = /\.(woff2?|ttf|otf)$/i.test(node.name);
			const isImageFile = isImageDeckFile(file);
			return (
				<SidebarMenuItem className={isDragging ? "opacity-40" : undefined}>
					<div className="group/row relative">
						<SidebarMenuButton
							className={cn(
								"pr-14!",
								isImageFile && "hover:bg-accent hover:text-accent-foreground",
							)}
							onClick={isImageFile ? () => onPreviewImage(file) : undefined}
							tooltip={file.id}
							{...dragProps}
						>
							{isFontFile ? <Type /> : <Image />}
							<span className="min-w-0 flex-1 truncate">{node.name}</span>
						</SidebarMenuButton>
						<FileTreeAction
							label="Rename file"
							onClick={() => onRenameFile(file)}
							className="right-7 text-muted-foreground"
						>
							<Pencil />
						</FileTreeAction>
						<FileTreeAction
							label="Delete file"
							onClick={() => onDeleteFile(file)}
							className="text-muted-foreground hover:text-destructive"
						>
							<Trash2 />
						</FileTreeAction>
					</div>
				</SidebarMenuItem>
			);
		}

		return (
			<SidebarMenuItem className={isDragging ? "opacity-40" : undefined}>
				<div className="group/row relative">
					<SidebarMenuButton
						isActive={selectedFileId === file.id}
						className={cn(
							"pr-14! data-[active=true]:bg-primary data-[active=true]:text-primary-foreground hover:bg-accent hover:text-accent-foreground",
							filePresence.length > 0 && "pr-24!",
						)}
						onClick={() => selectFile(file)}
						tooltip={file.id}
						{...dragProps}
					>
						<File />
						<span className="min-w-0 flex-1 truncate">{node.name}</span>
					</SidebarMenuButton>
					<FilePresenceDots participants={filePresence} fileName={file.id} />
					<FileTreeAction
						label="Rename file"
						onClick={() => onRenameFile(file)}
						className="right-7 text-muted-foreground"
					>
						<Pencil />
					</FileTreeAction>
					<FileTreeAction
						label="Delete file"
						onClick={() => onDeleteFile(file)}
						className="text-muted-foreground hover:text-destructive"
					>
						<Trash2 />
					</FileTreeAction>
				</div>
			</SidebarMenuItem>
		);
	}

	const isActiveBranch = Boolean(
		selectedFileId && (selectedFileId === node.path || selectedFileId.startsWith(`${node.path}/`)),
	);
	const isOpen = openFolders.get(node.path) ?? false;
	const folderFile = node.file?.type === "folder" ? node.file : null;
	const isDragOver =
		(dragState.dragOverPath === node.path && dragState.draggingFileId !== null) ||
		dropUploadDragOverPath === node.path;
	const handleInternalDrop = (event: React.DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (dragState.draggingFileId) {
			void moveFile(dragState.draggingFileId, node.path);
		}
	};

	return (
		<SidebarMenuItem>
			<Collapsible
				open={isOpen}
				onOpenChange={(open) => setFolderOpen(node.path, open)}
				className="group/collapsible [&[data-open]>div>[data-sidebar=menu-button]>svg:first-child]:rotate-90"
			>
				<div className="group/row relative">
					<CollapsibleTrigger
						render={
							<SidebarMenuButton
								isActive={isActiveBranch}
								tooltip={node.path}
								className={cn("pr-14!", isDragOver && "ring-2 ring-primary ring-inset")}
								onDragOver={(event) => {
									if (onExternalFileDragOverPath(event, node.path)) {
										return;
									}
									if (!dragState.draggingFileId) {
										return;
									}
									event.preventDefault();
									event.stopPropagation();
									event.dataTransfer.dropEffect = "move";
									setDragOverPath(node.path);
								}}
								onDragLeave={(event) => {
									if (!event.currentTarget.contains(event.relatedTarget as Node)) {
										onExternalFileDragLeave(event);
										setDragOverPath(null);
									}
								}}
								onDrop={(event) => {
									if (onExternalFileDropOnPath(event, node.path)) {
										return;
									}
									handleInternalDrop(event);
								}}
							>
								<ChevronRight className="transition-transform" />
								<Folder />
								<span className="min-w-0 flex-1 truncate">{node.name}</span>
							</SidebarMenuButton>
						}
					/>
					{folderFile && (
						<>
							<FileTreeAction
								label="Rename folder"
								onClick={() => onRenameFile(folderFile)}
								className="right-7 text-muted-foreground"
							>
								<Pencil />
							</FileTreeAction>
							<FileTreeAction
								label="Delete folder"
								onClick={() => onDeleteFile(folderFile)}
								className="text-muted-foreground hover:text-destructive"
							>
								<Trash2 />
							</FileTreeAction>
						</>
					)}
				</div>
				<CollapsibleContent
					onDragOver={(event) => {
						if (onExternalFileDragOverPath(event, node.path)) {
							return;
						}
						if (!dragState.draggingFileId) {
							return;
						}
						event.preventDefault();
						event.stopPropagation();
						event.dataTransfer.dropEffect = "move";
						setDragOverPath(node.path);
					}}
					onDragLeave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node)) {
							onExternalFileDragLeave(event);
							setDragOverPath(null);
						}
					}}
					onDrop={(event) => {
						if (onExternalFileDropOnPath(event, node.path)) {
							return;
						}
						handleInternalDrop(event);
					}}
				>
					<SidebarMenuSub>
						{node.children.map((child) => (
							<FileTreeItem key={child.path} node={child} />
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</Collapsible>
		</SidebarMenuItem>
	);
}

export function FileTreeView({
	workspace,
	onPreviewImage,
	onDeleteFile,
	onRenameFile,
}: FileTreeViewProps) {
	const dragStateRef = useRef(workspace.dragState);
	dragStateRef.current = workspace.dragState;

	const isExternalFileDrag = (event: React.DragEvent) =>
		Array.from(event.dataTransfer.types).includes("Files");
	const onExternalFileDragOverPath = (event: React.DragEvent, path: string): boolean => {
		if (dragStateRef.current.draggingFileId || !isExternalFileDrag(event)) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "copy";
		workspace.setDropUploadDragOverPath(path);
		return true;
	};
	const onExternalFileDragLeave = (event: React.DragEvent) => {
		if (isExternalFileDrag(event)) {
			workspace.setDropUploadDragOverPath(null);
		}
	};
	const onExternalFileDropOnPath = (event: React.DragEvent, destinationFolder: string): boolean => {
		const droppedFiles = Array.from(event.dataTransfer.files);
		if (dragStateRef.current.draggingFileId || droppedFiles.length === 0) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();
		void workspace.uploadDroppedFiles(droppedFiles, destinationFolder || undefined);
		return true;
	};
	const contextValue: FileTreeContextValue = {
		selectedFileId: workspace.selectedFileId,
		selectFile: workspace.selectFile,
		openFolders: workspace.openFolders,
		setFolderOpen: workspace.setFolderOpen,
		presenceByFileId: workspace.presenceByFileId,
		dragState: workspace.dragState,
		dropUploadDragOverPath: workspace.dropUploadDragOverPath,
		startDrag: workspace.startDrag,
		endDrag: workspace.endDrag,
		setDragOverPath: workspace.setDragOverPath,
		moveFile: workspace.moveFile,
		onPreviewImage,
		onDeleteFile,
		onRenameFile,
		onExternalFileDragOverPath,
		onExternalFileDragLeave,
		onExternalFileDropOnPath,
	};
	const isRootDragOver =
		(workspace.dragState.dragOverPath === "" && workspace.dragState.draggingFileId !== null) ||
		workspace.dropUploadDragOverPath === "";

	return (
		<FileTreeContext value={contextValue}>
			<div
				className={isRootDragOver ? "rounded-md ring-2 ring-primary ring-inset" : undefined}
				onDragOver={(event) => {
					if (onExternalFileDragOverPath(event, "")) {
						return;
					}
					if (workspace.dragState.draggingFileId) {
						event.preventDefault();
						event.dataTransfer.dropEffect = "move";
						workspace.setDragOverPath("");
					}
				}}
				onDragLeave={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node)) {
						onExternalFileDragLeave(event);
						workspace.setDragOverPath(null);
					}
				}}
				onDrop={(event) => {
					if (onExternalFileDropOnPath(event, "")) {
						return;
					}
					event.preventDefault();
					if (workspace.dragState.draggingFileId) {
						void workspace.moveFile(workspace.dragState.draggingFileId, "");
					}
				}}
			>
				{workspace.dropUploadError && (
					<p
						role="alert"
						className="mx-2 mb-2 whitespace-pre-line rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
					>
						{workspace.dropUploadError}
					</p>
				)}
				<SidebarMenu>
					{workspace.isUploadingDrop ? (
						<SidebarMenuItem>
							<SidebarMenuButton disabled>
								<Upload className="animate-pulse" />
								Uploading files...
							</SidebarMenuButton>
						</SidebarMenuItem>
					) : null}

					{workspace.isLoading ? (
						<SidebarMenuButton disabled>
							<RefreshCw className="animate-spin" />
							Loading files...
						</SidebarMenuButton>
					) : null}

					{workspace.error ? (
						<SidebarMenuButton
							className="bg-destructive/10 text-destructive hover:bg-destructive/20"
							onClick={() => void workspace.reload()}
						>
							<RefreshCw />
							Retry
						</SidebarMenuButton>
					) : null}

					{!workspace.isLoading && !workspace.error && workspace.tree.length === 0 ? (
						<SidebarMenuItem>
							<SidebarMenuButton disabled>
								<File />
								No files yet
							</SidebarMenuButton>
						</SidebarMenuItem>
					) : null}

					{workspace.tree.map((node) => (
						<FileTreeItem key={node.path} node={node} />
					))}
				</SidebarMenu>
			</div>
		</FileTreeContext>
	);
}
