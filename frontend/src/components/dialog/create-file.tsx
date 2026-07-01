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

export function CreateFileDialog({ projectId, open, onOpenChange, onCreated }: Props) {
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
			const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
				method: "POST",

				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to create file");
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
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<DialogHeader>
						<DialogTitle>New File</DialogTitle>
						<DialogDescription>
							Enter a file name ending in <code>.md</code> or <code>.css</code>. Use <code>/</code>{" "}
							to create subfolders.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<Label htmlFor="file-name">File name</Label>
							<Input
								id="file-name"
								name="file-name"
								placeholder="slides.md"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</Field>
					</FieldGroup>
					{error && <ErrorAlert title="Failed to create file" description={error} />}
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