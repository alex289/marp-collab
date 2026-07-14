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
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/config";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from "swr";

export function CreatePresentationDialog() {
	const { mutate } = useSWRConfig();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleOpenChange(next: boolean) {
		setOpen(next);
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
			const res = await fetch(`${API_URL}/projects`, {
				method: "POST",

				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to create presentation");
				return;
			}

			const { projectId } = (await res.json()) as { projectId: string };
			await mutate(`${API_URL}/projects`);
			setOpen(false);
			await navigate({ to: "/presentations/$id", params: { id: projectId } });
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger
				render={
					<Button variant="outline">
						<PlusIcon /> Create Presentation
					</Button>
				}
			/>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<DialogHeader>
						<DialogTitle>Create Presentation</DialogTitle>
						<DialogDescription>Enter the details for your new presentation.</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<Label htmlFor="presentation-name">Name</Label>
							<Input
								id="presentation-name"
								name="presentation-name"
								placeholder="My Presentation"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</Field>
					</FieldGroup>
					{error && <ErrorAlert title="Failed to create presentation" description={error} />}
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
