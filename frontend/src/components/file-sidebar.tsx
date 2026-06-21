// oxlint-disable no-warning-comments
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import type { DeckFile } from "@/lib/types";
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
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TooltipProvider } from "./ui/tooltip";
import { CreateFileDialog } from "@/components/dialog/create-file";
import { CreateFolderDialog } from "@/components/dialog/create-folder";
import { UploadFileDialog } from "@/components/dialog/upload-file";
import { DeleteFileDialog } from "@/components/dialog/delete-file";
import { API_URL } from "@/lib/config";

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

const WorkspaceRailButton = ({
	active,
	label,
	onClick,
	children,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) => (
	<button
		type="button"
		onClick={onClick}
		title={label}
		aria-label={label}
		className={cn(
			"flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4",
			active &&
				"bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
		)}
	>
		{children}
	</button>
);

type DragState = {
	draggingFileId: string | null;
	dragOverPath: string | null;
};

type WorkspacePanel = "files" | "search" | "outline";

type NestedFileItemProps = {
	node: NestedFileNode;
	selectedFileId: string | null;
	onSelectFile: (file: DeckFile) => void;
	onDeleteFile: (file: DeckFile) => void;
	openFolders: Record<string, boolean>;
	setFolderOpen: (path: string, open: boolean) => void;
	dragState: DragState;
	onDragStart: (fileId: string) => void;
	onDragEnd: () => void;
	onDragOverPath: (path: string | null) => void;
	onDropOnPath: (destinationFolder: string) => void;
};

const NestedFileItem = ({
	node,
	selectedFileId,
	onSelectFile,
	onDeleteFile,
	openFolders,
	setFolderOpen,
	dragState,
	onDragStart,
	onDragEnd,
	onDragOverPath,
	onDropOnPath,
}: NestedFileItemProps) => {
	const isFolder = node.children.length > 0 || node.file?.type === "folder";

	if (!isFolder) {
		if (!node.file) {
			return null;
		}

		const file = node.file;
		const isDragging = dragState.draggingFileId === file.id;

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
						{node.name}
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
					className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground hover:bg-accent hover:text-accent-foreground"
					onClick={() => onSelectFile(file)}
					tooltip={file.id}
					{...dragProps}
				>
					<File />
					{node.name}
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

	const isActiveBranch = Boolean(
		selectedFileId && (selectedFileId === node.path || selectedFileId.startsWith(`${node.path}/`)),
	);
	const isOpen = openFolders[node.path] ?? false;
	const folderFile = node.file?.type === "folder" ? node.file : null;
	const isDragOver = dragState.dragOverPath === node.path && dragState.draggingFileId !== null;

	return (
		<SidebarMenuItem>
			<Collapsible
				open={isOpen}
				onOpenChange={(open) => setFolderOpen(node.path, open)}
				className="group/collapsible [&[data-state=open]>[data-sidebar=menu-button]>svg:first-child]:rotate-90"
			>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton
						isActive={isActiveBranch}
						tooltip={node.path}
						className={isDragOver ? "ring-2 ring-primary ring-inset" : undefined}
						onDragOver={(e) => {
							e.preventDefault();
							e.stopPropagation();
							e.dataTransfer.dropEffect = "move";
							onDragOverPath(node.path);
						}}
						onDragLeave={(e) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node)) {
								onDragOverPath(null);
							}
						}}
						onDrop={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onDropOnPath(node.path);
						}}
					>
						<ChevronRight className="transition-transform" />
						<Folder />
						{node.name}
					</SidebarMenuButton>
				</CollapsibleTrigger>
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
				<CollapsibleContent>
					<SidebarMenuSub>
						{node.children.map((child) => (
							<NestedFileItem
								key={child.path}
								node={child}
								selectedFileId={selectedFileId}
								onSelectFile={onSelectFile}
								onDeleteFile={onDeleteFile}
								openFolders={openFolders}
								setFolderOpen={setFolderOpen}
								dragState={dragState}
								onDragStart={onDragStart}
								onDragEnd={onDragEnd}
								onDragOverPath={onDragOverPath}
								onDropOnPath={onDropOnPath}
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
}: FileSidebarProps) => {
	const nestedFileTree = useMemo(() => buildNestedFileTree(files), [files]);
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
	const dragStateRef = useRef(dragState);
	dragStateRef.current = dragState;

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
				credentials: "include",
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

	const isRootDragOver = dragState.dragOverPath === "" && dragState.draggingFileId !== null;
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
				if (dragState.draggingFileId) {
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
					handleDragOverPath("");
				}
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) {
					handleDragOverPath(null);
				}
			}}
			onDrop={(e) => {
				e.preventDefault();
				void handleDropOnPath("");
			}}
		>
			<SidebarMenu>
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
						onSelectFile={onSelectFile}
						onDeleteFile={setFileToDelete}
						openFolders={openFolders}
						setFolderOpen={setFolderOpen}
						dragState={dragState}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onDragOverPath={handleDragOverPath}
						onDropOnPath={handleDropOnPath}
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
				className="md:min-h-svh min-h-fit"
				style={
					{
						"--sidebar-width": "19rem",
						"--sidebar-width-icon": "3rem",
					} as React.CSSProperties
				}
			>
				<TooltipProvider>
					<Sidebar variant="sidebar" collapsible="icon" className="static pt-0">
						<SidebarContent>
							<div className="flex min-h-0 flex-1">
								<div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border px-1.5 py-2">
									<WorkspaceRailButton
										active={activePanel === "files"}
										label="Files"
										onClick={() => handlePanelButtonClick("files")}
									>
										<Files />
									</WorkspaceRailButton>
									<WorkspaceRailButton
										active={activePanel === "search"}
										label="Search"
										onClick={() => handlePanelButtonClick("search")}
									>
										<Search />
									</WorkspaceRailButton>
									<WorkspaceRailButton
										active={activePanel === "outline"}
										label="Outline"
										onClick={() => handlePanelButtonClick("outline")}
									>
										<ListTree />
									</WorkspaceRailButton>
								</div>
								<div className="min-w-0 flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
									{activePanel === "files" ? filesPanel : null}
									{activePanel === "search" ? (searchPanel ?? emptyPanel) : null}
									{activePanel === "outline" ? (outlinePanel ?? emptyPanel) : null}
								</div>
							</div>
						</SidebarContent>
					</Sidebar>
				</TooltipProvider>
			</SidebarProvider>
		</>
	);
};
