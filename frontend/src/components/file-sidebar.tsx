// oxlint-disable no-warning-comments
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, File, ChevronRight, Folder, FilePlus, Upload, Image } from "lucide-react";
import type { DeckFile } from "@/lib/types";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarProvider,
	SidebarRail,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TooltipProvider } from "./ui/tooltip";
import { CreateFileDialog } from "@/components/dialog/create-file";
import { UploadFileDialog } from "@/components/dialog/upload-file";

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
		const leftIsFolder = left.children.length > 0 || left.file === null;
		const rightIsFolder = right.children.length > 0 || right.file === null;

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

type NestedFileItemProps = {
	node: NestedFileNode;
	selectedFileId: string | null;
	onSelectFile: (file: DeckFile) => void;
	openFolders: Record<string, boolean>;
	setFolderOpen: (path: string, open: boolean) => void;
};

const NestedFileItem = ({
	node,
	selectedFileId,
	onSelectFile,
	openFolders,
	setFolderOpen,
}: NestedFileItemProps) => {
	const isFolder = node.children.length > 0;

	if (!isFolder) {
		if (!node.file) {
			return null;
		}

		const file = node.file;

		if (file.type === "asset") {
			return (
				<SidebarMenuItem>
					<SidebarMenuButton tooltip={file.id}>
						<Image />
						{node.name}
					</SidebarMenuButton>
				</SidebarMenuItem>
			);
		}

		return (
			<SidebarMenuItem>
				<SidebarMenuButton
					isActive={selectedFileId === file.id}
					className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground hover:bg-accent hover:text-accent-foreground"
					onClick={() => onSelectFile(file)}
					tooltip={file.id}
				>
					<File />
					{node.name}
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	const isActiveBranch = Boolean(
		selectedFileId && (selectedFileId === node.path || selectedFileId.startsWith(`${node.path}/`)),
	);
	const isOpen = openFolders[node.path] ?? false;

	return (
		<SidebarMenuItem>
			<Collapsible
				open={isOpen}
				onOpenChange={(open) => setFolderOpen(node.path, open)}
				className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
			>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isActiveBranch} tooltip={node.path}>
						<ChevronRight className="transition-transform" />
						<Folder />
						{node.name}
					</SidebarMenuButton>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<SidebarMenuSub>
						{node.children.map((child) => (
							<NestedFileItem
								key={child.path}
								node={child}
								selectedFileId={selectedFileId}
								onSelectFile={onSelectFile}
								openFolders={openFolders}
								setFolderOpen={setFolderOpen}
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
}: FileSidebarProps) => {
	const nestedFileTree = useMemo(() => buildNestedFileTree(files), [files]);
	const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
	const [createFileOpen, setCreateFileOpen] = useState(false);
	const [uploadFileOpen, setUploadFileOpen] = useState(false);

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

	return (
		<>
			<CreateFileDialog
				projectId={projectId}
				open={createFileOpen}
				onOpenChange={setCreateFileOpen}
				onCreated={onRetry}
			/>
			<UploadFileDialog
				projectId={projectId}
				open={uploadFileOpen}
				onOpenChange={setUploadFileOpen}
				onUploaded={onRetry}
			/>
			<SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
				<TooltipProvider>
					<Sidebar variant="floating" collapsible="icon" className="static pt-0">
						<SidebarContent>
							<SidebarGroup>
								<SidebarGroupLabel className="flex items-center justify-between pr-1">
									<span>Files</span>
									<div className="flex items-center gap-0.5">
										<button
											type="button"
											onClick={() => setCreateFileOpen(true)}
											title="New file"
											className="flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4"
										>
											<FilePlus />
										</button>
										<button
											type="button"
											onClick={() => setUploadFileOpen(true)}
											title="Upload file"
											className="flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4"
										>
											<Upload />
										</button>
									</div>
								</SidebarGroupLabel>
								<SidebarGroupContent>
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
												openFolders={openFolders}
												setFolderOpen={setFolderOpen}
											/>
										))}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						</SidebarContent>
						<SidebarRail />
					</Sidebar>
				</TooltipProvider>
			</SidebarProvider>
		</>
	);
};
