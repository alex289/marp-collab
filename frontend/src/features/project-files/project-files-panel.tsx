import { useState } from "react";
import { Download, FilePlus, Files, FolderPlus, Upload } from "lucide-react";
import type { DeckFile } from "../../lib/types";
import { CreateFileDialog } from "../../components/dialog/create-file";
import { CreateFolderDialog } from "../../components/dialog/create-folder";
import { DeleteFileDialog } from "../../components/dialog/delete-file";
import { RenameFileDialog } from "../../components/dialog/rename-file";
import { UploadFileDialog } from "../../components/dialog/upload-file";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "../../components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { FileTreeView } from "./file-tree-view";
import { ImagePreviewDialog } from "./image-preview-dialog";
import type { ProjectFilesWorkspace } from "./use-project-files-workspace";

type ProjectFilesPanelProps = {
	workspace: ProjectFilesWorkspace;
};

function ProjectFilesHeaderAction({
	onClick,
	label,
	children,
}: {
	onClick: () => void;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						onClick={onClick}
						aria-label={label}
						className="flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4"
					>
						{children}
					</button>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export function ProjectFilesPanel({ workspace }: ProjectFilesPanelProps) {
	const [createFileOpen, setCreateFileOpen] = useState(false);
	const [createFolderOpen, setCreateFolderOpen] = useState(false);
	const [uploadFileOpen, setUploadFileOpen] = useState(false);
	const [fileToDelete, setFileToDelete] = useState<DeckFile | null>(null);
	const [fileToRename, setFileToRename] = useState<DeckFile | null>(null);
	const [previewImageFile, setPreviewImageFile] = useState<DeckFile | null>(null);

	const handleExportProject = () => {
		const link = document.createElement("a");
		link.href = workspace.exportUrl();
		link.download = "";
		document.body.append(link);
		link.click();
		link.remove();
	};

	return (
		<>
			<CreateFileDialog
				open={createFileOpen}
				onOpenChange={setCreateFileOpen}
				onCreate={workspace.createFile}
			/>
			<CreateFolderDialog
				open={createFolderOpen}
				onOpenChange={setCreateFolderOpen}
				onCreate={workspace.createFolder}
			/>
			<UploadFileDialog
				open={uploadFileOpen}
				onOpenChange={setUploadFileOpen}
				onUpload={workspace.uploadFiles}
			/>
			<DeleteFileDialog
				file={fileToDelete}
				open={fileToDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						setFileToDelete(null);
					}
				}}
				onDelete={workspace.deleteFile}
			/>
			<RenameFileDialog
				file={fileToRename}
				open={fileToRename !== null}
				onOpenChange={(open) => {
					if (!open) {
						setFileToRename(null);
					}
				}}
				onRename={workspace.renameFile}
			/>
			<ImagePreviewDialog
				workspace={workspace}
				file={previewImageFile}
				onOpenChange={(open) => {
					if (!open) {
						setPreviewImageFile(null);
					}
				}}
			/>
			<SidebarGroup>
				<SidebarGroupLabel className="flex items-center justify-between pr-1 pl-0 pb-2 group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100">
					<div className="flex items-center gap-2 pb-2 pl-0 mt-2">
						<Files className="size-4" />
						Files
					</div>

					<div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
						<ProjectFilesHeaderAction onClick={() => setCreateFileOpen(true)} label="New file">
							<FilePlus />
						</ProjectFilesHeaderAction>
						<ProjectFilesHeaderAction onClick={() => setCreateFolderOpen(true)} label="New folder">
							<FolderPlus />
						</ProjectFilesHeaderAction>
						<ProjectFilesHeaderAction onClick={() => setUploadFileOpen(true)} label="Upload file">
							<Upload />
						</ProjectFilesHeaderAction>
						<ProjectFilesHeaderAction onClick={handleExportProject} label="Export project as ZIP">
							<Download />
						</ProjectFilesHeaderAction>
					</div>
				</SidebarGroupLabel>
				<SidebarGroupContent>
					<FileTreeView
						workspace={workspace}
						onPreviewImage={setPreviewImageFile}
						onDeleteFile={setFileToDelete}
						onRenameFile={setFileToRename}
					/>
				</SidebarGroupContent>
			</SidebarGroup>
		</>
	);
}
