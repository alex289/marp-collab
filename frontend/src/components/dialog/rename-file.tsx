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
import { getProjectFilesErrorMessage } from "@/features/project-files/project-files-client";
import type { DeckFile } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

type Props = {
	file: DeckFile | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRename: (file: DeckFile, name: string) => Promise<void>;
};

const getBasename = (path: string): string => path.split("/").pop() ?? path;

export function RenameFileDialog({ file, open, onOpenChange, onRename }: Props) {
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
			await onRename(file, name.trim());
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
