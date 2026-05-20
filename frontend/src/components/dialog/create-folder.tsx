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
import { useState } from "react";

type Props = {
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
};

export function CreateFolderDialog({ projectId, open, onOpenChange, onCreated }: Props) {
	const [folderName, setFolderName] = useState("");
	const [fileName, setFileName] = useState("slides.md");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleOpenChange(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setFolderName("");
			setFileName("slides.md");
			setError(null);
			setIsSubmitting(false);
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const name = `${folderName.trim()}/${fileName.trim()}`;

		try {
			const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to create folder");
				return;
			}

			onCreated();
			handleOpenChange(false);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<DialogHeader>
						<DialogTitle>New Folder</DialogTitle>
						<DialogDescription>
							Folders must contain at least one file. You can add more files later.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<Label htmlFor="folder-name">Folder name</Label>
							<Input
								id="folder-name"
								name="folder-name"
								placeholder="assets"
								value={folderName}
								onChange={(e) => setFolderName(e.target.value)}
								required
							/>
						</Field>
						<Field>
							<Label htmlFor="first-file-name">First file name</Label>
							<Input
								id="first-file-name"
								name="first-file-name"
								placeholder="slides.md"
								value={fileName}
								onChange={(e) => setFileName(e.target.value)}
								required
							/>
						</Field>
					</FieldGroup>
					{error && <ErrorAlert title="Failed to create folder" description={error} />}
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" type="button">
								Cancel
							</Button>
						</DialogClose>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
