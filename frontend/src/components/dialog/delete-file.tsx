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
import { API_URL } from "@/lib/config";
import type { DeckFile } from "@/lib/types";
import { useState } from "react";
import ErrorAlert from "@/components/alerts/error-alert";

type Props = {
	projectId: string;
	file: DeckFile | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeleted: () => void;
};

export function DeleteFileDialog({ projectId, file, open, onOpenChange, onDeleted }: Props) {
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
			const endpoint =
				file.type === "folder"
					? `${API_URL}/projects/${projectId}/folders/${encodeURIComponent(file.id)}`
					: `${API_URL}/projects/${projectId}/files/${encodeURIComponent(file.id)}`;
			const res = await fetch(endpoint, { method: "DELETE" });

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to delete file");
				return;
			}

			onDeleted();
			handleOpenChange(false);
		} catch {
			setError("An unexpected error occurred. Please try again.");
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
				{error && <ErrorAlert title="Failed to delete file" description={error} />}
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
