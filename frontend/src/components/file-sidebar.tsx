// oxlint-disable no-warning-comments
import { useState } from "react";
import { Files, ListTree, RotateCcw, Search, Settings, Trash2 } from "lucide-react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import useSWR from "swr";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarProvider,
	useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
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
import { ProjectFilesPanel } from "@/features/project-files/project-files-panel";
import type { ProjectFilesWorkspace } from "@/features/project-files/use-project-files-workspace";

type WorkspacePanel = "files" | "search" | "outline" | "settings";

type ProjectSettingsResponse = {
	project: Project;
	isOwner: boolean;
};

const WORKSPACE_PANEL_HOTKEYS = {
	files: "Alt+1",
	search: "Alt+2",
	outline: "Alt+3",
	settings: "Alt+4",
} as const;

const projectSettingsFetcher = async (url: string): Promise<ProjectSettingsResponse> => {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Request failed: ${res.status} ${res.statusText}`);
	}
	return res.json() as Promise<ProjectSettingsResponse>;
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
		<div className="flex h-12 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 text-sidebar-foreground md:hidden">
			<WorkspaceRailButtons activePanel={activePanel} onPanelClick={handlePanelClick} />
		</div>
	);
};

type FileSidebarProps = {
	workspace: ProjectFilesWorkspace;
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	/** Expanded sidebar width in pixels. */
	width?: number;
	/** True while the user drags the resize handle; disables width transitions. */
	isResizing?: boolean;
	searchPanel?: React.ReactNode;
	outlinePanel?: React.ReactNode;
	themeNames: string[];
	currentTheme: string;
	onThemeChange: (theme: string) => void;
	themeSelectDisabled: boolean;
	onProjectDeleted?: () => void;
	onResetPaneLayout?: () => void;
};

export const FileSidebar = ({
	workspace,
	sidebarOpen,
	setSidebarOpen,
	width = 304,
	isResizing = false,
	searchPanel = null,
	outlinePanel = null,
	themeNames,
	currentTheme,
	onThemeChange,
	themeSelectDisabled,
	onProjectDeleted,
	onResetPaneLayout,
}: FileSidebarProps) => {
	const [activePanel, setActivePanel] = useState<WorkspacePanel>("files");
	const projectId = workspace.projectId;

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

	const emptyPanel = (
		<SidebarGroup>
			<SidebarGroupLabel className="pl-0 pb-2">Not available yet</SidebarGroupLabel>
			<SidebarGroupContent>
				<p className="px-2 text-xs text-muted-foreground">This panel is being loaded.</p>
			</SidebarGroupContent>
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
					<Label className="px-1 text-xs font-medium">Layout</Label>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start"
						disabled={!onResetPaneLayout}
						onClick={onResetPaneLayout}
					>
						<RotateCcw />
						Reset panel sizes
					</Button>
					<p className="px-1 text-xs text-muted-foreground">
						Restores the sidebar, editor and preview to their default widths.
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
		<SidebarProvider
			open={sidebarOpen}
			onOpenChange={setSidebarOpen}
			className={cn("min-h-0 md:h-full", isResizing && "**:transition-none")}
			style={
				{
					"--sidebar-width": `min(${width}px, 40vw)`,
					"--sidebar-width-icon": "3rem",
				} as React.CSSProperties
			}
		>
			<MobileWorkspaceRail activePanel={activePanel} setActivePanel={setActivePanel} />
			<Sidebar
				variant="sidebar"
				collapsible="icon"
				className="static h-full border-0 pt-0 group-data-[side=left]:border-r-0"
			>
				<SidebarContent className="h-full overflow-hidden border-r border-sidebar-border bg-sidebar">
					<div className="flex h-full min-h-0 flex-1">
						<div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border px-1.5 py-2 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:border-r-0">
							<WorkspaceRailButtons
								activePanel={activePanel}
								onPanelClick={handlePanelButtonClick}
							/>
						</div>
						<div className="min-h-0 min-w-0 flex-1 overflow-auto group-data-[collapsible=icon]:hidden">
							<div className={activePanel === "files" ? undefined : "hidden"}>
								<ProjectFilesPanel workspace={workspace} />
							</div>
							{activePanel === "search" ? (searchPanel ?? emptyPanel) : null}
							{activePanel === "outline" ? (outlinePanel ?? emptyPanel) : null}
							{activePanel === "settings" ? settingsPanel : null}
						</div>
					</div>
				</SidebarContent>
			</Sidebar>
		</SidebarProvider>
	);
};
