import ErrorAlert from "@/components/alerts/error-alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import type { UploadProjectFilesResult } from "@/features/project-files/project-files-client";
import { useState } from "react";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUpload: (files: File[]) => Promise<UploadProjectFilesResult>;
};

export function UploadFileDialog({ open, onOpenChange, onUpload }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

	function handleOpenChange(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setError(null);
			setIsSubmitting(false);
			setSelectedFiles([]);
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (selectedFiles.length === 0) {
			return;
		}

		setIsSubmitting(true);
		setError(null);

		const { failures } = await onUpload(selectedFiles);

		if (failures.length > 0) {
			setError(failures.join("\n"));
			setSelectedFiles([]);
			setIsSubmitting(false);
			return;
		}

		setIsSubmitting(false);
		handleOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<DialogHeader>
						<DialogTitle>Upload Files</DialogTitle>
						<DialogDescription>
							Markdown, images, videos, CSS, and font files are allowed.
						</DialogDescription>
					</DialogHeader>
					<FileDropZone
						accept="image/*,video/*,.css,.md,.markdown,.woff,.woff2,.ttf,.otf"
						multiple
						onChange={setSelectedFiles}
					/>
					{selectedFiles.length > 0 && (
						<ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
							{selectedFiles.map((file) => (
								<li key={file.name} className="truncate">
									{file.name}
								</li>
							))}
						</ul>
					)}
					{error && <ErrorAlert title="Failed to upload file" description={error} />}
					<DialogFooter>
						<DialogClose
							render={
								<Button variant="outline" type="button" disabled={isSubmitting}>
									Cancel
								</Button>
							}
						/>
						<Button type="submit" disabled={isSubmitting || selectedFiles.length === 0}>
							{isSubmitting
								? "Uploading..."
								: selectedFiles.length > 1
									? `Upload ${selectedFiles.length} files`
									: "Upload"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
