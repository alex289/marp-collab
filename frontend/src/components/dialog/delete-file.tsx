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
import type { DeckFile } from "@/lib/types";
import { useState } from "react";
import ErrorAlert from "@/components/alerts/error-alert";
import { getProjectFilesErrorMessage } from "@/features/project-files/project-files-client";

type Props = {
	file: DeckFile | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDelete: (file: DeckFile) => Promise<void>;
};

export function DeleteFileDialog({ file, open, onOpenChange, onDelete }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleOpenChange(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setError(null);
			setIsSubmitting(false);
		}
	}

	async function handleDelete() {
		if (!file) {
			return;
		}
		setIsSubmitting(true);
		setError(null);

		try {
			await onDelete(file);
			handleOpenChange(false);
		} catch (requestError) {
			setError(
				getProjectFilesErrorMessage(
					requestError,
					"An unexpected error occurred. Please try again.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	const isFolder = file?.type === "folder";
	const displayName = file?.id;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{isFolder ? "Delete Folder" : "Delete File"}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete{" "}
						<span className="font-medium text-foreground">{displayName}</span>? This action cannot
						be undone.
					</DialogDescription>
				</DialogHeader>
				{error && (
					<ErrorAlert
						title={isFolder ? "Failed to delete folder" : "Failed to delete file"}
						description={error}
					/>
				)}
				<DialogFooter>
					<DialogClose
						render={
							<Button variant="outline" type="button" disabled={isSubmitting}>
								Cancel
							</Button>
						}
					/>
					<Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
						{isSubmitting ? "Deleting..." : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
