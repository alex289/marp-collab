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
import { useState } from "react";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (name: string) => Promise<void>;
};

export function CreateFolderDialog({ open, onOpenChange, onCreate }: Props) {
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleOpenChange(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setName("");
			setError(null);
			setIsSubmitting(false);
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		try {
			await onCreate(name.trim());
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
						<DialogTitle>New Folder</DialogTitle>
						<DialogDescription>
							Use <code>/</code> to create nested folders.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<Label htmlFor="folder-name">Folder name</Label>
							<Input
								id="folder-name"
								name="folder-name"
								placeholder="assets"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</Field>
					</FieldGroup>
					{error && <ErrorAlert title="Failed to create folder" description={error} />}
					<DialogFooter>
						<DialogClose
							render={
								<Button variant="outline" type="button" disabled={isSubmitting}>
									Cancel
								</Button>
							}
						/>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
