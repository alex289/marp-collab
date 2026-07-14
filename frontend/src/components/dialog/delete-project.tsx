import type { Project } from "@/lib/types";
import { useState, type ReactElement } from "react";
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
import ErrorAlert from "../alerts/error-alert";
import { Button } from "../ui/button";
import { API_URL } from "@/lib/config";
import { Trash2Icon } from "lucide-react";
import { mutate } from "swr";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type DeleteProjectDialogProps = {
	project: Project;
	trigger?: ReactElement;
	onDeleted?: () => void;
};

export function DeleteProjectDialog({ project, trigger, onDeleted }: DeleteProjectDialogProps) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleOpenChange(next: boolean) {
		setOpen(next);

		if (!next) {
			setError(null);
			setIsSubmitting(false);
		}
	}

	async function handleDelete() {
		setIsSubmitting(true);
		setError(null);

		try {
			const res = await fetch(`${API_URL}/projects/${project.id}`, {
				method: "DELETE",
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to delete presentation");
				return;
			}

			await mutate(`${API_URL}/projects`);
			setOpen(false);
			onDeleted?.();
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			{trigger ? (
				<DialogTrigger render={trigger} />
			) : (
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
										aria-label={`Delete ${project.name}`}
										className="ml-1"
									>
										<Trash2Icon />
									</Button>
								}
							/>
						}
					/>
					<TooltipContent>Delete presentation</TooltipContent>
				</Tooltip>
			)}
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Delete Presentation</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete{" "}
						<span className="font-medium text-foreground">{project.name}</span>? This action cannot
						be undone.
					</DialogDescription>
				</DialogHeader>
				{error && <ErrorAlert title="Failed to delete presentation" description={error} />}
				<DialogFooter>
					<DialogClose
						render={
							<Button variant="outline" type="button" disabled={isSubmitting}>
								Cancel
							</Button>
						}
					/>
					<Button
						variant="destructive"
						disabled={isSubmitting}
						onClick={async (e) => {
							e.preventDefault();
							e.stopPropagation();
							await handleDelete();
						}}
					>
						{isSubmitting ? "Deleting..." : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
