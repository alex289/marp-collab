import ErrorAlert from "@/components/alerts/error-alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { FolderUpIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from "swr";

type ProjectTemplateId = "default" | "whs";

function WhsMarkIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="20 158 92 70" className={className} aria-hidden="true">
			<path
				d="M49.0552 164.628 45.7942 191.622 45.7234 191.665 42.9017 168.389 36.0799 172.561 32.9215 199.827 32.852 199.87 29.9242 176.324 22.2951 180.989 29.0005 217.357 36.5266 212.754 39.434 186.32 39.5035 186.277 41.9428 209.445 49.5031 204.823 56.6519 159.987 49.0552 164.628ZM67.3571 194.223 78.874 201.512 70.3207 206.654 58.8016 199.364 49.6781 204.849 82.7012 225.75 91.8252 220.264 78.78 212.009 87.3337 206.867 100.378 215.121 109.504 209.636 76.4811 188.737 67.3571 194.223Z"
				fill="currentColor"
			/>
		</svg>
	);
}

const TEMPLATE_OPTIONS: { id: ProjectTemplateId; label: string; preview: React.ReactNode }[] = [
	{
		id: "default",
		label: "Default",
		preview: (
			<div className="flex aspect-video w-full flex-col gap-1 rounded-sm bg-muted p-2">
				<div className="h-1.5 w-2/3 rounded-full bg-foreground/30" />
				<div className="h-1 w-full rounded-full bg-foreground/15" />
				<div className="h-1 w-5/6 rounded-full bg-foreground/15" />
			</div>
		),
	},
	{
		id: "whs",
		label: "Westfälische Hochschule",
		preview: (
			<div className="flex aspect-video w-full items-center justify-center rounded-sm bg-muted p-2">
				<WhsMarkIcon className="h-16 w-auto text-foreground/40" />
			</div>
		),
	},
];

export function CreatePresentationDialog() {
	const { mutate } = useSWRConfig();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<"name" | "template" | "import">("name");
	const [name, setName] = useState("");
	const [template, setTemplate] = useState<ProjectTemplateId>("default");
	const [zipFile, setZipFile] = useState<File | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setStep("name");
			setName("");
			setTemplate("default");
			setZipFile(null);
			setError(null);
			setIsSubmitting(false);
		}
	}

	function goToStep(next: "name" | "template" | "import") {
		setError(null);
		setStep(next);
	}

	function handleContinue(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			return;
		}
		goToStep("template");
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		try {
			const res = await fetch(`${API_URL}/projects`, {
				method: "POST",

				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, template }),
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

	async function handleImportSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!zipFile) {
			return;
		}
		setIsSubmitting(true);
		setError(null);

		try {
			const formData = new FormData();
			formData.append("name", name);
			formData.append("file", zipFile);

			const res = await fetch(`${API_URL}/projects/import`, {
				method: "POST",
				body: formData,
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to import presentation");
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
				{step === "name" ? (
					<form onSubmit={handleContinue} className="flex flex-col gap-3">
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
									autoFocus
								/>
							</Field>
						</FieldGroup>
						<DialogFooter>
							<DialogClose
								render={
									<Button variant="outline" type="button">
										Cancel
									</Button>
								}
							/>
							<Button type="submit" disabled={!name.trim()}>
								Continue
							</Button>
						</DialogFooter>
					</form>
				) : step === "template" ? (
					<form onSubmit={handleSubmit} className="flex flex-col gap-3">
						<DialogHeader>
							<DialogTitle>Choose a Theme</DialogTitle>
							<DialogDescription>Pick a starting theme for "{name}".</DialogDescription>
						</DialogHeader>
						<div className="grid grid-cols-2 gap-3">
							{TEMPLATE_OPTIONS.map((option) => (
								<Card
									key={option.id}
									role="button"
									tabIndex={0}
									onClick={() => setTemplate(option.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											setTemplate(option.id);
										}
									}}
									className={cn(
										"cursor-pointer items-center gap-2 px-3 py-3 text-center ring-1 transition-colors",
										template === option.id
											? "ring-2 ring-primary"
											: "ring-foreground/10 hover:ring-foreground/20",
									)}
								>
									{option.preview}
									<span className="text-xs font-medium">{option.label}</span>
								</Card>
							))}
						</div>

						{error && <ErrorAlert title="Failed to create presentation" description={error} />}
						<DialogFooter>
							<Button
								variant="outline"
								type="button"
								className="sm:mr-auto"
								onClick={() => goToStep("import")}
							>
								<FolderUpIcon /> Import a ZIP
							</Button>
							<Button variant="outline" type="button" onClick={() => goToStep("name")}>
								Back
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Creating..." : "Create"}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<form onSubmit={handleImportSubmit} className="flex flex-col gap-3">
						<DialogHeader>
							<DialogTitle>Import from ZIP</DialogTitle>
							<DialogDescription>
								Import "{name}" from a previously exported ZIP file.
							</DialogDescription>
						</DialogHeader>
						<FileDropZone
							accept=".zip,application/zip"
							onChange={(files) => setZipFile(files[0] ?? null)}
						/>
						{zipFile && <p className="truncate text-xs text-muted-foreground">{zipFile.name}</p>}
						{error && <ErrorAlert title="Failed to import presentation" description={error} />}
						<DialogFooter>
							<Button variant="outline" type="button" onClick={() => goToStep("template")}>
								Back
							</Button>
							<Button type="submit" disabled={isSubmitting || !zipFile}>
								{isSubmitting ? "Importing..." : "Import"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
