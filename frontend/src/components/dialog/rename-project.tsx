import { API_URL } from "@/lib/config";
import { useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { Field, FieldGroup } from "../ui/field";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import ErrorAlert from "../alerts/error-alert";
import { Button } from "../ui/button";
import type { Project } from "@/lib/types";
import { PencilIcon } from "lucide-react";
import { mutate } from "swr";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function RenameProjectDialog({ project }: { project: Project }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(project.name);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleOpenChange(next: boolean) {
		setOpen(next);
		setError(null);
		setIsSubmitting(false);

		if (next) {
			setName(project.name);
		}
	}

	async function handleSubmit() {
		const trimmed = name.trim();

		if (!trimmed || trimmed === project.name) {
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const res = await fetch(`${API_URL}/projects/${project.id}`, {
				method: "PATCH",

				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: trimmed }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to rename presentation");
				return;
			}

			await mutate(`${API_URL}/projects`);
			setOpen(false);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	const trimmed = name.trim();
	const canSubmit = trimmed.length > 0 && trimmed !== project.name && !isSubmitting;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<Tooltip>
				<TooltipTrigger
					render={
						<DialogTrigger
							render={
								<Button
									type="button"
									size="icon-sm"
									variant="ghost"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setOpen(true);
									}}
									aria-label={`Rename ${project.name}`}
									className="mr-1"
								>
									<PencilIcon />
								</Button>
							}
						/>
					}
				/>
				<TooltipContent>Rename presentation</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-md">
				<form
					onSubmit={async (e) => {
						e.preventDefault();
						e.stopPropagation();
						await handleSubmit();
					}}
					className="flex flex-col gap-3"
				>
					<DialogHeader>
						<DialogTitle>Rename Presentation</DialogTitle>
						<DialogDescription>Update the name shown on the presentations page.</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<Label htmlFor={`project-name-${project.id}`}>Name</Label>
							<Input
								id={`project-name-${project.id}`}
								name="project-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={255}
								required
							/>
						</Field>
					</FieldGroup>
					{error && <ErrorAlert title="Failed to rename presentation" description={error} />}
					<DialogFooter>
						<DialogClose
							render={
								<Button
									variant="outline"
									type="button"
									disabled={isSubmitting}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setOpen(false);
									}}
								>
									Cancel
								</Button>
							}
						/>
						<Button type="submit" disabled={!canSubmit}>
							{isSubmitting ? "Renaming..." : "Rename"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
