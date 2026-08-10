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
import type { ProjectCollaboratorsResponse } from "@/lib/types";
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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const accessLevelSelectItems = [
	{ value: "read-only", label: "Read Only" },
	{ value: "full-access", label: "Full access" },
];

export function ManageProjectCollaborator({ projectId }: { projectId: string }) {
	const { mutate } = useSWRConfig();
	const [open, setOpen] = useState(false);
	const [collaboratorEmail, setCollaboratorEmail] = useState("");
	const [accessLevel, setAccessLevel] = useState("read-only");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);
	const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
	const [isEmailValid, setIsEmailValid] = useState(false);

	const collaboratorsKey = `${API_URL}/projects/${projectId}/collaborators`;
	const { data: projectData } = useSWR<{ isOwner: boolean }>(
		`${API_URL}/projects/${projectId}`,
		fetcher,
	);
	const isOwner = projectData?.isOwner ?? false;

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setCollaboratorEmail("");
			setAccessLevel("read-only");
			setError(null);
			setIsEmailValid(false);
		}
	}

	const { data, isLoading } = useSWR<ProjectCollaboratorsResponse>(collaboratorsKey, fetcher);

	const owner = data?.owner;
	const collaborators = data?.collaborators ?? [];

	async function handleAddCollaborator() {
		setIsSubmitting(true);
		try {
			const res = await fetch(`${API_URL}/projects/${projectId}/collaborators`, {
				method: "POST",

				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: collaboratorEmail, readOnly: accessLevel === "read-only" }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to add collaborator");
				return;
			}

			setCollaboratorEmail("");
			setAccessLevel("read-only");
			setIsEmailValid(false);
			await mutate(collaboratorsKey);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleUpdateCollaborator(userId: string, readOnly: boolean) {
		setUpdatingUserId(userId);
		setError(null);
		try {
			const res = await fetch(`${API_URL}/projects/${projectId}/collaborators/${userId}`, {
				method: "PATCH",

				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ readOnly }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to update collaborator");
				return;
			}

			await mutate(collaboratorsKey);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setUpdatingUserId(null);
		}
	}

	async function handleRemoveCollaborator(userId: string) {
		setIsRemoving(true);
		try {
			const res = await fetch(`${API_URL}/projects/${projectId}/collaborators/${userId}`, {
				method: "DELETE",

				headers: { "Content-Type": "application/json" },
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to remove collaborator");
				return;
			}

			await mutate(collaboratorsKey);
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setIsRemoving(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<Tooltip>
				<TooltipTrigger
					render={
						<DialogTrigger
							render={
								<Button type="button" variant="ghost" size="sm" aria-label="Share document">
									<Share />
									<span className="max-sm:sr-only">Share</span>
								</Button>
							}
						/>
					}
				/>
				<TooltipContent>Share document</TooltipContent>
			</Tooltip>
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
						{!isLoading && owner ? (
							<TableRow>
								<TableCell>{owner.userName}</TableCell>
								<TableCell className="text-muted-foreground">Owner</TableCell>
								<TableCell />
							</TableRow>
						) : null}
						{!isLoading &&
							collaborators?.map((collaborator) => (
								<TableRow key={collaborator.userId}>
									<TableCell>{collaborator.userName}</TableCell>
									<TableCell>
										<Select
											items={accessLevelSelectItems}
											value={collaborator.readOnly ? "read-only" : "full-access"}
											disabled={updatingUserId === collaborator.userId}
											onValueChange={(value) =>
												handleUpdateCollaborator(collaborator.userId, value === "read-only")
											}
										>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Select access level" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{accessLevelSelectItems.map((item) => (
														<SelectItem key={item.value} value={item.value}>
															{item.label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="text-right">
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="destructive"
														size="icon"
														aria-label="Remove collaborator"
														disabled={!isOwner || isRemoving}
														onClick={() => handleRemoveCollaborator(collaborator.userId)}
													>
														<Trash />
													</Button>
												}
											/>
											<TooltipContent>Remove collaborator</TooltipContent>
										</Tooltip>
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
									type="email"
									placeholder="Collaborator's email"
									value={collaboratorEmail}
									onChange={(e) => {
										setCollaboratorEmail(e.target.value);
										setIsEmailValid(e.target.validity.valid);
									}}
									disabled={!isOwner}
									required
								/>
							</TableCell>
							<TableCell>
								<Select
									items={accessLevelSelectItems}
									defaultValue="read-only"
									value={accessLevel}
									onValueChange={(value) => setAccessLevel(value ?? "read-only")}
									disabled={!isOwner}
								>
									<SelectTrigger id="access-level" className="w-full">
										<SelectValue placeholder="Select access level" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{accessLevelSelectItems.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</TableCell>
							<TableCell className="text-right">
								<Button
									type="button"
									variant="outline"
									disabled={!isOwner || isSubmitting || !isEmailValid}
									onClick={handleAddCollaborator}
								>
									<PlusIcon />
									<span>Add</span>
								</Button>
							</TableCell>
						</TableRow>
					</TableFooter>
				</Table>
				{error && <ErrorAlert title="Failed to update collaborators" description={error} />}
				{!isOwner && (
					<p className="text-xs text-muted-foreground">
						Only the project owner can invite or manage collaborators.
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
