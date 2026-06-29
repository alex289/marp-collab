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
import { API_URL } from "@/lib/config";
import { useState } from "react";

type Props = {
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUploaded: () => void;
};

export function UploadFileDialog({ projectId, open, onOpenChange, onUploaded }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	function handleOpenChange(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setError(null);
			setIsSubmitting(false);
			setSelectedFile(null);
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!selectedFile) {
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const formData = new FormData();
			formData.append("file", selectedFile);

			const res = await fetch(`${API_URL}/projects/${projectId}/files/upload`, {
				method: "POST",
				credentials: "include",
				body: formData,
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to upload file");
				return;
			}

			onUploaded();
			handleOpenChange(false);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<DialogHeader>
						<DialogTitle>Upload File</DialogTitle>
						<DialogDescription>
							Markdown, images, videos, CSS, and font files are allowed.
						</DialogDescription>
					</DialogHeader>
					<FileDropZone
						accept="image/*,video/*,.css,.md,.markdown,.woff,.woff2,.ttf,.otf"
						onChange={setSelectedFile}
					/>
					{selectedFile && (
						<p className="truncate text-xs text-muted-foreground">{selectedFile.name}</p>
					)}
					{error && <ErrorAlert title="Failed to upload file" description={error} />}
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" type="button">
								Cancel
							</Button>
						</DialogClose>
						<Button type="submit" disabled={isSubmitting || !selectedFile}>
							{isSubmitting ? "Uploading..." : "Upload"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
