import ErrorAlert from "@/components/alerts/error-alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/config";
import { fetcher } from "@/lib/fetcher";
import type { SharedProject } from "@/lib/types";
import { PlusIcon, Share, Trash } from "lucide-react";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function ManageProjectCollaborator({ projectId }: { projectId: string }) {
	const { mutate } = useSWRConfig();
	const [open, setOpen] = useState(false);
	const [collaboratorEmail, setCollaboratorEmail] = useState("");
	const [accessLevel, setAccessLevel] = useState("read-only");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setCollaboratorEmail("");
			setAccessLevel("read-only");
			setError(null);
		}
	}

	const { data, isLoading } = useSWR<{ collaborators: SharedProject[] }>(
		`${API_URL}/projects/${projectId}/collaborators`,
		fetcher,
	);

	const collaborators = data?.collaborators ?? [];

	async function handleAddCollaborator() {
		setIsSubmitting(true);
		try {
			const res = await fetch(`${API_URL}/projects/${projectId}/collaborators`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: collaboratorEmail, readOnly: accessLevel === "read-only" }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to add collaborator");
				return;
			}

			await mutate(`${API_URL}/projects/collaborators`);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleRemoveCollaborator(userId: string) {
		setIsRemoving(true);
		try {
			const res = await fetch(`${API_URL}/projects/${projectId}/collaborators/${userId}`, {
				method: "DELETE",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to remove collaborator");
				return;
			}

			await mutate(`${API_URL}/projects/collaborators`);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsRemoving(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					title="Share the document with others"
					aria-label="Share document"
				>
					<Share />
					<span>Share</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Manage Collaboration</DialogTitle>
					<DialogDescription>Manage who can view and edit this presentation.</DialogDescription>
				</DialogHeader>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Access</TableHead>
							<TableHead></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{!isLoading &&
							collaborators?.map((collaborator) => (
								<TableRow key={collaborator.userId}>
									<TableCell>{collaborator.userName}</TableCell>
									<TableCell>{collaborator.readOnly ? "Read-only" : "Full access"}</TableCell>
									<TableCell className="text-right">
										<Button
											variant="destructive"
											size="sm"
											title="Remove collaborator"
											aria-label="Remove collaborator"
											disabled={isRemoving}
											onClick={() => handleRemoveCollaborator(collaborator.userId)}
										>
											<Trash />
										</Button>
									</TableCell>
								</TableRow>
							))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell>
								<Input
									id="collaborator-email"
									name="collaborator-email"
									placeholder="Collaborator's email"
									value={collaboratorEmail}
									onChange={(e) => setCollaboratorEmail(e.target.value)}
									required
								/>
							</TableCell>
							<TableCell>
								<Select defaultValue="read-only" value={accessLevel} onValueChange={setAccessLevel}>
									<SelectTrigger id="access-level" className="w-full">
										<SelectValue placeholder="Select access level" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="read-only">Read-only</SelectItem>
										<SelectItem value="full-access">Full access</SelectItem>
									</SelectContent>
								</Select>
							</TableCell>
							<TableCell className="text-right">
								<Button
									type="button"
									variant="outline"
									title="Share the document with others"
									aria-label="Share document"
									disabled={isSubmitting}
									onClick={handleAddCollaborator}
								>
									<PlusIcon />
									<span>Add</span>
								</Button>
							</TableCell>
						</TableRow>
					</TableFooter>
				</Table>
				{error && <ErrorAlert title="Failed to create presentation" description={error} />}
			</DialogContent>
		</Dialog>
	);
}
