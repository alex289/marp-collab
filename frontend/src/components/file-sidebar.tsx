// oxlint-disable no-warning-comments
import { RefreshCw, File } from "lucide-react";

import type { DeckFile } from "@/lib/types";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarProvider,
	SidebarRail,
} from "@/components/ui/sidebar";

type FileSidebarProps = {
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
	files,
	selectedFileId,
	onSelectFile,
	isLoading,
	error,
	onRetry,
	sidebarOpen,
	setSidebarOpen,
}: FileSidebarProps) => {
	return (
		<SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
			<Sidebar variant="floating" collapsible="icon" className="static pt-0">
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Files</SidebarGroupLabel>
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

								{/* TODO: Collapsible here for nested files */}
								{files.map((file) => (
									<SidebarMenuButton
										isActive={selectedFileId === file.id}
										className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground hover:bg-accent hover:text-accent-foreground"
										key={file.id}
										onClick={() => onSelectFile(file)}
									>
										<File />
										{file.label}
									</SidebarMenuButton>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarRail />
			</Sidebar>
		</SidebarProvider>
	);
};
