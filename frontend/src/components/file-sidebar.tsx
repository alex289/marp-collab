// oxlint-disable no-warning-comments
import { useEffect, useMemo, useRef, useState } from "react";
import type { Awareness } from "y-protocols/awareness.js";
import {
	RefreshCw,
	File,
	Files,
	ChevronRight,
	Folder,
	FilePlus,
	FolderPlus,
	Upload,
	Download,
	Image,
	Trash2,
	Type,
	Search,
	ListTree,
	Settings,
} from "lucide-react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import useSWR from "swr";
import type { DeckFile, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarProvider,
	useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { CreateFileDialog } from "@/components/dialog/create-file";
import { CreateFolderDialog } from "@/components/dialog/create-folder";
import { UploadFileDialog } from "@/components/dialog/upload-file";
import { DeleteFileDialog } from "@/components/dialog/delete-file";
import { DeleteProjectDialog } from "@/components/dialog/delete-project";
import { API_URL } from "@/lib/config";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ProjectNameSetting } from "@/components/project-name-setting";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { uploadProjectFiles } from "@/lib/upload-files";

type NestedFileNode = {
	name: string;
	path: string;
	file: DeckFile | null;
	children: NestedFileNode[];
};

type MutableNestedFileNode = {
	name: string;
	path: string;
	file: DeckFile | null;
	children: Map<string, MutableNestedFileNode>;
};

const normalizePath = (path: string): string => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

const toNestedNodes = (nodeMap: Map<string, MutableNestedFileNode>): NestedFileNode[] => {
	const nodes = Array.from(nodeMap.values()).map((node) => ({
		name: node.name,
		path: node.path,
		file: node.file,
		children: toNestedNodes(node.children),
	}));

	nodes.sort((left, right) => {
		const leftIsFolder =
			left.children.length > 0 || left.file === null || left.file?.type === "folder";
		const rightIsFolder =
			right.children.length > 0 || right.file === null || right.file?.type === "folder";

		if (leftIsFolder !== rightIsFolder) {
			return leftIsFolder ? -1 : 1;
		}

		return left.name.localeCompare(right.name);
	});

	return nodes;
};

const buildNestedFileTree = (files: DeckFile[]): NestedFileNode[] => {
	const root = new Map<string, MutableNestedFileNode>();

	for (const file of files) {
		const normalizedId = normalizePath(file.id);
		if (normalizedId.split("/").pop() === ".keep") {
			continue;
		}
		if (!normalizedId) {
			continue;
		}

		const segments = normalizedId.split("/").filter(Boolean);
		if (segments.length === 0) {
			continue;
		}

		let currentLevel = root;
		let currentPath = "";

		for (const [index, segment] of segments.entries()) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;

			let node = currentLevel.get(segment);
			if (!node) {
				node = {
					name: segment,
					path: currentPath,
					file: null,
					children: new Map(),
				};
				currentLevel.set(segment, node);
			}

			if (index === segments.length - 1) {
				node.file = file;
			} else {
				currentLevel = node.children;
			}
		}
	}

	return toNestedNodes(root);
};

const getAncestorFolderPaths = (fileId: string): string[] => {
	const normalizedId = normalizePath(fileId);
	const segments = normalizedId.split("/").filter(Boolean);
	const ancestors: string[] = [];
	let currentPath = "";

	for (const segment of segments.slice(0, -1)) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		ancestors.push(currentPath);
	}

	return ancestors;
};

const getParentFolder = (fileId: string): string => {
	const normalized = normalizePath(fileId);
	const lastSlash = normalized.lastIndexOf("/");
	return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
};

const SidebarHeaderAction = ({
	onClick,
	title,
	children,
}: {
	onClick: () => void;
	title: string;
	children: React.ReactNode;
}) => (
	<button
		type="button"
		onClick={onClick}
		title={title}
		className="flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4"
	>
		{children}
	</button>
);

const MAX_FILE_PRESENCE_DOTS = 3;

const FilePresenceDots = ({
	participants,
	fileName,
}: {
	participants: FilePresenceParticipant[];
	fileName: string;
}) => {
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
						className="absolute top-1/2 right-7 z-10 flex h-5 -translate-y-1/2 items-center gap-1 group-data-[collapsible=icon]:hidden mr-1"
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
};

const WorkspaceRailButton = ({
	active,
	label,
	hotkey,
	onClick,
	children,
}: {
	active: boolean;
	label: string;
	hotkey: string;
	onClick: () => void;
	children: React.ReactNode;
}) => {
	const platform = window.navigator.platform.toLowerCase();
	const isMac =
		platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad");
	const modifierLabel = isMac ? "⌥" : "Alt";
	const keyLabel = hotkey.replace("Alt+", "");
	const displayHotkey = `${modifierLabel}+${keyLabel}`;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						onClick={onClick}
						title={`${label} (${displayHotkey})`}
						aria-label={`${label} (${displayHotkey})`}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4",
							active &&
								"bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
						)}
					>
						{children}
					</button>
				}
			/>
			<TooltipContent>
				<span>{label}</span>
				<KbdGroup className="ml-2">
					<Kbd>{modifierLabel}</Kbd>
					<span>+</span>
					<Kbd>{keyLabel}</Kbd>
				</KbdGroup>
			</TooltipContent>
		</Tooltip>
	);
};

type DragState = {
	draggingFileId: string | null;
	dragOverPath: string | null;
};

type FilePresenceParticipant = {
	id: string;
	name: string;
	color: string;
	image: string | null;
};

type FilePresenceByFileId = Record<string, FilePresenceParticipant[]>;

type WorkspacePanel = "files" | "search" | "outline" | "settings";

type ProjectSettingsResponse = {
	project: Project;
	isOwner: boolean;
};

const projectSettingsFetcher = async (url: string): Promise<ProjectSettingsResponse> => {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Request failed: ${res.status} ${res.statusText}`);
	}
	return res.json() as Promise<ProjectSettingsResponse>;
};

const parsePresenceParticipant = (value: unknown): FilePresenceParticipant | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	const user = value as Partial<FilePresenceParticipant>;
	if (typeof user.id !== "string" || user.id.length === 0) {
		return null;
	}

	return {
		id: user.id,
		name: typeof user.name === "string" && user.name.length > 0 ? user.name : "Unknown",
		color: typeof user.color === "string" && user.color.length > 0 ? user.color : "#0ea5e9",
		image: typeof user.image === "string" && user.image.length > 0 ? user.image : null,
	};
};

const parseActiveFileId = (value: unknown): string | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	const activeFile = value as { fileId?: unknown };
	return typeof activeFile.fileId === "string" && activeFile.fileId.length > 0
		? activeFile.fileId
		: null;
};

const getFilePresenceById = (
	awareness: Awareness,
	currentUserId: string | null,
): FilePresenceByFileId => {
	const participantsByFile = new Map<string, Map<string, FilePresenceParticipant>>();

	for (const state of awareness.getStates().values()) {
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

	const presenceByFileId: FilePresenceByFileId = {};
	for (const [fileId, participants] of participantsByFile.entries()) {
		presenceByFileId[fileId] = Array.from(participants.values()).sort((left, right) =>
			left.name === right.name
				? left.id.localeCompare(right.id)
				: left.name.localeCompare(right.name),
		);
	}

	return presenceByFileId;
};

const WORKSPACE_PANEL_HOTKEYS = {
	files: "Alt+1",
	search: "Alt+2",
	outline: "Alt+3",
	settings: "Alt+4",
} as const;

type WorkspaceRailButtonsProps = {
	activePanel: WorkspacePanel;
	onPanelClick: (panel: WorkspacePanel) => void;
};

const WorkspaceRailButtons = ({ activePanel, onPanelClick }: WorkspaceRailButtonsProps) => (
	<>
		<WorkspaceRailButton
			active={activePanel === "files"}
			label="Files"
			hotkey={WORKSPACE_PANEL_HOTKEYS.files}
			onClick={() => onPanelClick("files")}
		>
			<Files />
		</WorkspaceRailButton>
		<WorkspaceRailButton
			active={activePanel === "search"}
			label="Search"
			hotkey={WORKSPACE_PANEL_HOTKEYS.search}
			onClick={() => onPanelClick("search")}
		>
			<Search />
		</WorkspaceRailButton>
		<WorkspaceRailButton
			active={activePanel === "outline"}
			label="Outline"
			hotkey={WORKSPACE_PANEL_HOTKEYS.outline}
			onClick={() => onPanelClick("outline")}
		>
			<ListTree />
		</WorkspaceRailButton>
		<WorkspaceRailButton
			active={activePanel === "settings"}
			label="Settings"
			hotkey={WORKSPACE_PANEL_HOTKEYS.settings}
			onClick={() => onPanelClick("settings")}
		>
			<Settings />
		</WorkspaceRailButton>
	</>
);

type MobileWorkspaceRailProps = {
	activePanel: WorkspacePanel;
	setActivePanel: (panel: WorkspacePanel) => void;
};

const MobileWorkspaceRail = ({ activePanel, setActivePanel }: MobileWorkspaceRailProps) => {
	const { openMobile, setOpenMobile } = useSidebar();

	const handlePanelClick = (panel: WorkspacePanel) => {
		if (activePanel === panel) {
			setOpenMobile(!openMobile);
			return;
		}

		setActivePanel(panel);
		setOpenMobile(true);
	};

	return (
		<div className="flex h-12 items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-2 text-sidebar-foreground md:hidden">
			<WorkspaceRailButtons activePanel={activePanel} onPanelClick={handlePanelClick} />
		</div>
	);
};

type NestedFileItemProps = {
	node: NestedFileNode;
	selectedFileId: string | null;
	filePresenceById: FilePresenceByFileId;
	onSelectFile: (file: DeckFile) => void;
	onDeleteFile: (file: DeckFile) => void;
	openFolders: Record<string, boolean>;
	setFolderOpen: (path: string, open: boolean) => void;
	dragState: DragState;
	dropUploadDragOverPath: string | null;
	onDragStart: (fileId: string) => void;
	onDragEnd: () => void;
	onDragOverPath: (path: string | null) => void;
	onDropOnPath: (destinationFolder: string) => void;
	onExternalFileDragOverPath: (event: React.DragEvent, path: string) => boolean;
	onExternalFileDragLeave: (event: React.DragEvent) => void;
	onExternalFileDropOnPath: (event: React.DragEvent, destinationFolder: string) => boolean;
};

const NestedFileItem = ({
	node,
	selectedFileId,
	filePresenceById,
	onSelectFile,
	onDeleteFile,
	openFolders,
	setFolderOpen,
	dragState,
	dropUploadDragOverPath,
	onDragStart,
	onDragEnd,
	onDragOverPath,
	onDropOnPath,
	onExternalFileDragOverPath,
	onExternalFileDragLeave,
	onExternalFileDropOnPath,
}: NestedFileItemProps) => {
	const isFolder = node.children.length > 0 || node.file?.type === "folder";

	if (!isFolder) {
		if (!node.file) {
			return null;
		}

		const file = node.file;
		const isDragging = dragState.draggingFileId === file.id;
		const filePresence = filePresenceById[file.id] ?? [];

		const dragProps = {
			draggable: true,
			onDragStart: (e: React.DragEvent) => {
				e.dataTransfer.effectAllowed = "move";
				onDragStart(file.id);
			},
			onDragEnd: onDragEnd,
		};

		if (file.type === "asset") {
			const isFontFile = /\.(woff2?|ttf|otf)$/i.test(node.name);
			return (
				<SidebarMenuItem className={isDragging ? "opacity-40" : undefined}>
					<SidebarMenuButton tooltip={file.id} {...dragProps}>
						{isFontFile ? <Type /> : <Image />}
						<span className="min-w-0 flex-1 truncate">{node.name}</span>
					</SidebarMenuButton>
					<SidebarMenuAction
						showOnHover
						onClick={() => onDeleteFile(file)}
						title="Delete file"
						className="text-muted-foreground hover:text-destructive"
					>
						<Trash2 />
					</SidebarMenuAction>
				</SidebarMenuItem>
			);
		}

		return (
			<SidebarMenuItem className={isDragging ? "opacity-40" : undefined}>
				<SidebarMenuButton
					isActive={selectedFileId === file.id}
					className={cn(
						"data-[active=true]:bg-primary data-[active=true]:text-primary-foreground hover:bg-accent hover:text-accent-foreground",
						filePresence.length > 0 && "pr-16",
					)}
					onClick={() => onSelectFile(file)}
					tooltip={file.id}
					{...dragProps}
				>
					<File />
					<span className="min-w-0 flex-1 truncate">{node.name}</span>
				</SidebarMenuButton>
				<FilePresenceDots participants={filePresence} fileName={file.id} />
				<SidebarMenuAction
					showOnHover
					onClick={() => onDeleteFile(file)}
					title="Delete file"
					className="text-muted-foreground hover:text-destructive"
				>
					<Trash2 />
				</SidebarMenuAction>
			</SidebarMenuItem>
		);
	}

	const isActiveBranch = Boolean(
		selectedFileId && (selectedFileId === node.path || selectedFileId.startsWith(`${node.path}/`)),
	);
	const isOpen = openFolders[node.path] ?? false;
	const folderFile = node.file?.type === "folder" ? node.file : null;
	const isDragOver =
		(dragState.dragOverPath === node.path && dragState.draggingFileId !== null) ||
		dropUploadDragOverPath === node.path;

	return (
		<SidebarMenuItem>
			<Collapsible
				open={isOpen}
				onOpenChange={(open) => setFolderOpen(node.path, open)}
				className="group/collapsible [&[data-open]>[data-sidebar=menu-button]>svg:first-child]:rotate-90"
			>
				<CollapsibleTrigger
					render={
						<SidebarMenuButton
							isActive={isActiveBranch}
							tooltip={node.path}
							className={isDragOver ? "ring-2 ring-primary ring-inset" : undefined}
							onDragOver={(e) => {
								if (onExternalFileDragOverPath(e, node.path)) {
									return;
								}
								if (!dragState.draggingFileId) {
									return;
								}
								e.preventDefault();
								e.stopPropagation();
								e.dataTransfer.dropEffect = "move";
								onDragOverPath(node.path);
							}}
							onDragLeave={(e) => {
								if (!e.currentTarget.contains(e.relatedTarget as Node)) {
									onExternalFileDragLeave(e);
									onDragOverPath(null);
								}
							}}
							onDrop={(e) => {
								if (onExternalFileDropOnPath(e, node.path)) {
									return;
								}
								e.preventDefault();
								e.stopPropagation();
								onDropOnPath(node.path);
							}}
						>
							<ChevronRight className="transition-transform" />
							<Folder />
							{node.name}
						</SidebarMenuButton>
					}
				/>
				{folderFile && (
					<SidebarMenuAction
						showOnHover
						onClick={() => onDeleteFile(folderFile)}
						title="Delete folder"
						className="text-muted-foreground hover:text-destructive"
					>
						<Trash2 />
					</SidebarMenuAction>
				)}
				<CollapsibleContent
					onDragOver={(e) => {
						if (onExternalFileDragOverPath(e, node.path)) {
							return;
						}
						if (!dragState.draggingFileId) {
							return;
						}
						e.preventDefault();
						e.stopPropagation();
						e.dataTransfer.dropEffect = "move";
						onDragOverPath(node.path);
					}}
					onDragLeave={(e) => {
						if (!e.currentTarget.contains(e.relatedTarget as Node)) {
							onExternalFileDragLeave(e);
							onDragOverPath(null);
						}
					}}
					onDrop={(e) => {
						if (onExternalFileDropOnPath(e, node.path)) {
							return;
						}
						e.preventDefault();
						e.stopPropagation();
						onDropOnPath(node.path);
					}}
				>
					<SidebarMenuSub>
						{node.children.map((child) => (
							<NestedFileItem
								key={child.path}
								node={child}
								selectedFileId={selectedFileId}
								filePresenceById={filePresenceById}
								onSelectFile={onSelectFile}
								onDeleteFile={onDeleteFile}
								openFolders={openFolders}
								setFolderOpen={setFolderOpen}
								dragState={dragState}
								dropUploadDragOverPath={dropUploadDragOverPath}
								onDragStart={onDragStart}
								onDragEnd={onDragEnd}
								onDragOverPath={onDragOverPath}
								onDropOnPath={onDropOnPath}
								onExternalFileDragOverPath={onExternalFileDragOverPath}
								onExternalFileDragLeave={onExternalFileDragLeave}
								onExternalFileDropOnPath={onExternalFileDropOnPath}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</Collapsible>
		</SidebarMenuItem>
	);
};

type FileSidebarProps = {
	projectId: string;
	files: DeckFile[];
	selectedFileId: string | null;
	onSelectFile: (file: DeckFile) => void;
	isLoading: boolean;
	error: string | null;
	onRetry: () => void;
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	searchPanel?: React.ReactNode;
	outlinePanel?: React.ReactNode;
	themeNames: string[];
	currentTheme: string;
	onThemeChange: (theme: string) => void;
	themeSelectDisabled: boolean;
	onProjectDeleted?: () => void;
	presenceAwareness?: Awareness | null;
	currentUserId?: string | null;
};

export const FileSidebar = ({
	projectId,
	files,
	selectedFileId,
	onSelectFile,
	isLoading,
	error,
	onRetry,
	sidebarOpen,
	setSidebarOpen,
	searchPanel = null,
	outlinePanel = null,
	themeNames,
	currentTheme,
	onThemeChange,
	themeSelectDisabled,
	onProjectDeleted,
	presenceAwareness = null,
	currentUserId = null,
}: FileSidebarProps) => {
	const nestedFileTree = useMemo(() => buildNestedFileTree(files), [files]);
	const [filePresenceById, setFilePresenceById] = useState<FilePresenceByFileId>({});
	const [activePanel, setActivePanel] = useState<WorkspacePanel>("files");
	const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
	const [createFileOpen, setCreateFileOpen] = useState(false);
	const [createFolderOpen, setCreateFolderOpen] = useState(false);
	const [uploadFileOpen, setUploadFileOpen] = useState(false);
	const [fileToDelete, setFileToDelete] = useState<DeckFile | null>(null);
	const [dragState, setDragState] = useState<DragState>({
		draggingFileId: null,
		dragOverPath: null,
	});
	const [dropUploadDragOverPath, setDropUploadDragOverPath] = useState<string | null>(null);
	const [isUploadingDrop, setIsUploadingDrop] = useState(false);
	const [dropUploadError, setDropUploadError] = useState<string | null>(null);
	const dragStateRef = useRef(dragState);
	dragStateRef.current = dragState;

	useEffect(() => {
		if (!presenceAwareness) {
			setFilePresenceById({});
			return;
		}

		const update = () => setFilePresenceById(getFilePresenceById(presenceAwareness, currentUserId));

		update();
		presenceAwareness.on("change", update);

		return () => {
			presenceAwareness.off("change", update);
		};
	}, [currentUserId, presenceAwareness]);

	useEffect(() => {
		if (!selectedFileId) {
			return;
		}

		const ancestors = getAncestorFolderPaths(selectedFileId);
		if (ancestors.length === 0) {
			return;
		}

		setOpenFolders((previous) => {
			let hasChange = false;
			const next = { ...previous };

			for (const folderPath of ancestors) {
				if (!next[folderPath]) {
					next[folderPath] = true;
					hasChange = true;
				}
			}

			return hasChange ? next : previous;
		});
	}, [selectedFileId]);

	const setFolderOpen = (path: string, open: boolean) => {
		setOpenFolders((previous) => {
			if ((previous[path] ?? false) === open) {
				return previous;
			}

			return {
				...previous,
				[path]: open,
			};
		});
	};

	const handleDragStart = (fileId: string) => {
		setDragState({ draggingFileId: fileId, dragOverPath: null });
	};

	const handleDragEnd = () => {
		setDragState({ draggingFileId: null, dragOverPath: null });
	};

	const handleDragOverPath = (path: string | null) => {
		setDragState((prev) => (prev.dragOverPath === path ? prev : { ...prev, dragOverPath: path }));
	};

	const handleDropOnPath = async (destinationFolder: string) => {
		const fileId = dragStateRef.current.draggingFileId;
		setDragState({ draggingFileId: null, dragOverPath: null });

		if (!fileId) {
			return;
		}

		if (getParentFolder(fileId) === destinationFolder) {
			return;
		}

		const res = await fetch(
			`${API_URL}/projects/${projectId}/files/${encodeURIComponent(fileId)}`,
			{
				method: "PATCH",

				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ destination: destinationFolder }),
			},
		);

		if (!res.ok) {
			return;
		}

		const { newFileId } = (await res.json()) as { newFileId: string };

		if (selectedFileId === fileId) {
			const movedFile = files.find((f) => f.id === fileId);
			if (movedFile) {
				onSelectFile({ ...movedFile, id: newFileId });
			}
		}

		onRetry();
	};

	const isExternalFileDrag = (event: React.DragEvent) =>
		Array.from(event.dataTransfer.types).includes("Files");

	const handleDroppedFiles = async (droppedFiles: File[], destinationFolder: string) => {
		setDropUploadDragOverPath(null);
		setDropUploadError(null);
		setIsUploadingDrop(true);

		const { uploadedAny, failures } = await uploadProjectFiles({
			projectId,
			files: droppedFiles,
			destination: destinationFolder || undefined,
		});

		if (uploadedAny) {
			onRetry();
		}

		if (failures.length > 0) {
			setDropUploadError(failures.join("\n"));
		}

		setIsUploadingDrop(false);
	};

	const handleExternalFileDragOverPath = (event: React.DragEvent, path: string): boolean => {
		if (dragStateRef.current.draggingFileId || !isExternalFileDrag(event)) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "copy";
		setDropUploadDragOverPath(path);
		return true;
	};

	const handleExternalFileDragLeave = (event: React.DragEvent) => {
		if (isExternalFileDrag(event)) {
			setDropUploadDragOverPath(null);
		}
	};

	const handleExternalFileDropOnPath = (
		event: React.DragEvent,
		destinationFolder: string,
	): boolean => {
		const droppedFiles = Array.from(event.dataTransfer.files);
		if (dragStateRef.current.draggingFileId || droppedFiles.length === 0) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();
		void handleDroppedFiles(droppedFiles, destinationFolder);
		return true;
	};

	const handleExportProject = () => {
		const link = document.createElement("a");
		link.href = `${API_URL}/projects/${projectId}/export.zip`;
		link.download = "";
		document.body.append(link);
		link.click();
		link.remove();
	};

	const handlePanelButtonClick = (panel: WorkspacePanel) => {
		if (activePanel === panel) {
			setSidebarOpen(!sidebarOpen);
			return;
		}

		setActivePanel(panel);
		if (!sidebarOpen) {
			setSidebarOpen(true);
		}
	};

	useHotkeys([
		{
			hotkey: WORKSPACE_PANEL_HOTKEYS.files,
			callback: () => handlePanelButtonClick("files"),
		},
		{
			hotkey: WORKSPACE_PANEL_HOTKEYS.search,
			callback: () => handlePanelButtonClick("search"),
		},
		{
			hotkey: WORKSPACE_PANEL_HOTKEYS.outline,
			callback: () => handlePanelButtonClick("outline"),
		},
		{
			hotkey: WORKSPACE_PANEL_HOTKEYS.settings,
			callback: () => handlePanelButtonClick("settings"),
		},
	]);

	const isRootDragOver =
		(dragState.dragOverPath === "" && dragState.draggingFileId !== null) ||
		dropUploadDragOverPath === "";
	const emptyPanel = (
		<SidebarGroup>
			<SidebarGroupLabel className="pl-0 pb-2">Not available yet</SidebarGroupLabel>
			<SidebarGroupContent>
				<p className="px-2 text-xs text-muted-foreground">This panel is being loaded.</p>
			</SidebarGroupContent>
		</SidebarGroup>
	);
	const filesPanelMenu = (
		<div
			className={isRootDragOver ? "rounded-md ring-2 ring-primary ring-inset" : undefined}
			onDragOver={(e) => {
				if (handleExternalFileDragOverPath(e, "")) {
					return;
				}
				if (dragState.draggingFileId) {
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
					handleDragOverPath("");
				}
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) {
					handleExternalFileDragLeave(e);
					handleDragOverPath(null);
				}
			}}
			onDrop={(e) => {
				if (handleExternalFileDropOnPath(e, "")) {
					return;
				}
				e.preventDefault();
				void handleDropOnPath("");
			}}
		>
			{dropUploadError && (
				<p
					role="alert"
					className="mx-2 mb-2 whitespace-pre-line rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
				>
					{dropUploadError}
				</p>
			)}
			<SidebarMenu>
				{isUploadingDrop ? (
					<SidebarMenuItem>
						<SidebarMenuButton disabled>
							<Upload className="animate-pulse" />
							Uploading files...
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : null}

				{isLoading ? (
					<SidebarMenuButton disabled>
						<RefreshCw className="animate-spin" />
						Loading files...
					</SidebarMenuButton>
				) : null}

				{error ? (
					<SidebarMenuButton
						className="bg-destructive/10 text-destructive hover:bg-destructive/20"
						onClick={onRetry}
					>
						<RefreshCw />
						Retry
					</SidebarMenuButton>
				) : null}

				{!isLoading && !error && nestedFileTree.length === 0 ? (
					<SidebarMenuItem>
						<SidebarMenuButton disabled>
							<File />
							No files yet
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : null}

				{nestedFileTree.map((node) => (
					<NestedFileItem
						key={node.path}
						node={node}
						selectedFileId={selectedFileId}
						filePresenceById={filePresenceById}
						onSelectFile={onSelectFile}
						onDeleteFile={setFileToDelete}
						openFolders={openFolders}
						setFolderOpen={setFolderOpen}
						dragState={dragState}
						dropUploadDragOverPath={dropUploadDragOverPath}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onDragOverPath={handleDragOverPath}
						onDropOnPath={handleDropOnPath}
						onExternalFileDragOverPath={handleExternalFileDragOverPath}
						onExternalFileDragLeave={handleExternalFileDragLeave}
						onExternalFileDropOnPath={handleExternalFileDropOnPath}
					/>
				))}
			</SidebarMenu>
		</div>
	);
	const filesPanel = (
		<SidebarGroup>
			<SidebarGroupLabel className="flex items-center justify-between pr-1 pl-0 pb-2 group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100">
				<div className="flex items-center gap-2 pb-2 pl-0 mt-2">
					<Files className="size-4" />
					Files
				</div>

				<div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
					<SidebarHeaderAction onClick={() => setCreateFileOpen(true)} title="New file">
						<FilePlus />
					</SidebarHeaderAction>
					<SidebarHeaderAction onClick={() => setCreateFolderOpen(true)} title="New folder">
						<FolderPlus />
					</SidebarHeaderAction>
					<SidebarHeaderAction onClick={() => setUploadFileOpen(true)} title="Upload file">
						<Upload />
					</SidebarHeaderAction>
					<SidebarHeaderAction onClick={handleExportProject} title="Export project as ZIP">
						<Download />
					</SidebarHeaderAction>
				</div>
			</SidebarGroupLabel>
			<SidebarGroupContent>{filesPanelMenu}</SidebarGroupContent>
		</SidebarGroup>
	);
	const themeOptions = Array.from(new Set([...themeNames, currentTheme]));
	const projectSettingsKey = `${API_URL}/projects/${projectId}`;
	const { data: projectSettings } = useSWR<ProjectSettingsResponse>(
		projectSettingsKey,
		projectSettingsFetcher,
	);
	const settingsPanel = (
		<SidebarGroup>
			<SidebarGroupLabel className="flex items-center gap-2 pb-2 pl-0">
				<Settings className="size-4" />
				Settings
			</SidebarGroupLabel>
			<SidebarGroupContent className="space-y-4">
				<ProjectNameSetting projectId={projectId} />

				<div className="space-y-1.5">
					<Label htmlFor="theme-select" className="px-1 text-xs font-medium">
						Slide theme
					</Label>
					<Select
						value={currentTheme}
						onValueChange={(value) => value && onThemeChange(value)}
						disabled={themeSelectDisabled}
					>
						<SelectTrigger className="w-full" aria-label="Slide theme">
							<SelectValue placeholder="Theme" />
						</SelectTrigger>
						<SelectContent>
							{themeOptions.map((name) => (
								<SelectItem key={name} value={name}>
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="px-1 text-xs text-muted-foreground">
						{themeSelectDisabled
							? "Select a writable Markdown deck file to change its theme."
							: "Theme changes update the active deck frontmatter."}
					</p>
				</div>

				<div className="space-y-1.5">
					<Label className="px-1 text-xs font-medium">Danger zone</Label>
					{projectSettings?.project ? (
						<DeleteProjectDialog
							project={projectSettings.project}
							onDeleted={onProjectDeleted}
							trigger={
								<Button
									type="button"
									variant="destructive"
									className="w-full justify-start"
									disabled={!projectSettings.isOwner}
								>
									<Trash2 />
									Delete presentation
								</Button>
							}
						/>
					) : (
						<Button type="button" variant="destructive" className="w-full justify-start" disabled>
							<Trash2 />
							Delete presentation
						</Button>
					)}
					<p className="px-1 text-xs text-muted-foreground">
						{projectSettings?.isOwner
							? "Permanently delete this presentation and its files."
							: "Only the project owner can delete this presentation."}
					</p>
				</div>
			</SidebarGroupContent>
		</SidebarGroup>
	);

	return (
		<>
			<CreateFileDialog
				projectId={projectId}
				open={createFileOpen}
				onOpenChange={setCreateFileOpen}
				onCreated={onRetry}
			/>
			<CreateFolderDialog
				projectId={projectId}
				open={createFolderOpen}
				onOpenChange={setCreateFolderOpen}
				onCreated={onRetry}
			/>
			<UploadFileDialog
				projectId={projectId}
				open={uploadFileOpen}
				onOpenChange={setUploadFileOpen}
				onUploaded={onRetry}
			/>
			<DeleteFileDialog
				projectId={projectId}
				file={fileToDelete}
				open={fileToDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						setFileToDelete(null);
					}
				}}
				onDeleted={onRetry}
			/>
			<SidebarProvider
				open={sidebarOpen}
				onOpenChange={setSidebarOpen}
				className="min-h-0 md:h-full"
				style={
					{
						"--sidebar-width": "19rem",
						"--sidebar-width-icon": "3rem",
					} as React.CSSProperties
				}
			>
				<TooltipProvider>
					<MobileWorkspaceRail activePanel={activePanel} setActivePanel={setActivePanel} />
					<Sidebar
						variant="sidebar"
						collapsible="icon"
						className="static h-full border-0 pt-0 group-data-[side=left]:border-r-0"
					>
						<SidebarContent className="h-full overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
							<div className="flex h-full min-h-0 flex-1">
								<div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border px-1.5 py-2 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:border-r-0">
									<WorkspaceRailButtons
										activePanel={activePanel}
										onPanelClick={handlePanelButtonClick}
									/>
								</div>
								<div className="min-h-0 min-w-0 flex-1 overflow-auto group-data-[collapsible=icon]:hidden">
									{activePanel === "files" ? filesPanel : null}
									{activePanel === "search" ? (searchPanel ?? emptyPanel) : null}
									{activePanel === "outline" ? (outlinePanel ?? emptyPanel) : null}
									{activePanel === "settings" ? settingsPanel : null}
								</div>
							</div>
						</SidebarContent>
					</Sidebar>
				</TooltipProvider>
			</SidebarProvider>
		</>
	);
};
