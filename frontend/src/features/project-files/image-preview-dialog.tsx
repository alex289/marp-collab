import { useEffect, useState } from "react";
import type { DeckFile } from "../../lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import type { ProjectFilesWorkspace } from "./use-project-files-workspace";

type ImagePreviewDialogProps = {
	workspace: ProjectFilesWorkspace;
	file: DeckFile | null;
	onOpenChange: (open: boolean) => void;
};

export function ImagePreviewDialog({ workspace, file, onOpenChange }: ImagePreviewDialogProps) {
	const [loadError, setLoadError] = useState(false);

	useEffect(() => {
		setLoadError(false);
	}, [file?.id]);

	return (
		<Dialog open={file !== null} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle className="truncate pr-8">{file?.id ?? "Image"}</DialogTitle>
				</DialogHeader>
				{file ? (
					<div className="flex max-h-[75svh] min-h-48 items-center justify-center overflow-auto rounded-md bg-muted/40">
						{loadError ? (
							<p className="px-4 text-center text-xs text-muted-foreground">
								Image could not be loaded.
							</p>
						) : (
							<img
								src={workspace.fileUrl(file.id)}
								alt={file.id}
								className="max-h-[75svh] max-w-full object-contain"
								onError={() => setLoadError(true)}
							/>
						)}
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
