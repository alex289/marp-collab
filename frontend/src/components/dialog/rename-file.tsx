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
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/config";
import type { DeckFile } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

export type RenameResult =
	| { type: "file"; oldFileId: string; newFileId: string }
	| { type: "folder"; oldFolderPath: string; newFolderPath: string };

type Props = {
	projectId: string;
	file: DeckFile | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRenamed: (result: RenameResult) => void;
};

const getBasename = (path: string): string => path.split("/").pop() ?? path;

export function RenameFileDialog({ projectId, file, open, onOpenChange, onRenamed }: Props) {
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const originalName = useMemo(() => (file ? getBasename(file.id) : ""), [file]);
	const isFolder = file?.type === "folder";

	useEffect(() => {
		if (open) {
			setName(originalName);
			setError(null);
			setIsSubmitting(false);
		}
	}, [open, originalName]);

	function handleOpenChange(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setError(null);
			setIsSubmitting(false);
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!file) {
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const endpoint =
				file.type === "folder"
					? `${API_URL}/projects/${projectId}/folders/${encodeURIComponent(file.id)}/rename`
					: `${API_URL}/projects/${projectId}/files/${encodeURIComponent(file.id)}/rename`;
			const res = await fetch(endpoint, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: name.trim() }),
			});

			const data = (await res.json()) as {
				error?: string;
				newFileId?: string;
				newFolderPath?: string;
			};

			if (!res.ok) {
				setError(data.error ?? "Failed to rename item");
				return;
			}

			if (file.type === "folder" && data.newFolderPath) {
				onRenamed({ type: "folder", oldFolderPath: file.id, newFolderPath: data.newFolderPath });
				handleOpenChange(false);
				return;
			}

			if (data.newFileId) {
				onRenamed({ type: "file", oldFileId: file.id, newFileId: data.newFileId });
				handleOpenChange(false);
				return;
			}

			setError("Rename response was missing the new name.");
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
						<DialogTitle>{isFolder ? "Rename Folder" : "Rename File"}</DialogTitle>
						<DialogDescription>
							Enter a new name. The item will stay in its current folder.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<Label htmlFor="rename-name">Name</Label>
							<Input
								id="rename-name"
								name="rename-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</Field>
					</FieldGroup>
					{error && <ErrorAlert title="Failed to rename item" description={error} />}
					<DialogFooter>
						<DialogClose
							render={
								<Button variant="outline" type="button" disabled={isSubmitting}>
									Cancel
								</Button>
							}
						/>
						<Button type="submit" disabled={isSubmitting || name.trim() === ""}>
							{isSubmitting ? "Renaming..." : "Rename"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
