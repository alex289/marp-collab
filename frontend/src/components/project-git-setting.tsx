import { useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, GitBranch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { fetcher } from "@/lib/fetcher";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type ProjectGitConfig = {
	configured: boolean;
	remoteUrl: string | null;
	branch: string;
	hasCredentials: boolean;
	username: string | null;
};

type GitAction = "pull" | "push";
type GitResolution = "project" | "remote";

type GitConflict = {
	path: string;
	type: "add-add" | "binary" | "remote-deleted";
};

export function ProjectGitControls({
	projectId,
	canWrite,
	onSynced,
}: {
	projectId: string;
	canWrite: boolean;
	onSynced: () => void;
}) {
	const url = `${API_URL}/projects/${projectId}/git`;
	const { data } = useSWR<ProjectGitConfig>(canWrite ? url : null, fetcher);
	const [action, setAction] = useState<GitAction | null>(null);
	const [conflicts, setConflicts] = useState<GitConflict[]>([]);
	const [resolutions, setResolutions] = useState<Record<string, GitResolution>>({});

	const runAction = async (
		nextAction: GitAction,
		conflictResolutions?: Record<string, GitResolution>,
	) => {
		if (action) {
			return;
		}

		setAction(nextAction);
		try {
			const response = await fetch(`${url}/${nextAction}`, {
				method: "POST",
				...(nextAction === "pull"
					? {
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ resolutions: conflictResolutions }),
						}
					: {}),
			});
			const result = (await response.json()) as {
				error?: string;
				pulled?: boolean;
				pushed?: boolean;
				conflicts?: GitConflict[];
			};
			if (response.status === 409 && result.conflicts?.length) {
				setConflicts(result.conflicts);
				setResolutions(
					Object.fromEntries(
						result.conflicts.map((conflict) => [conflict.path, "project" as const]),
					),
				);
				return;
			}
			if (!response.ok) {
				throw new Error(result.error ?? `Git ${nextAction} failed`);
			}

			onSynced();
			setConflicts([]);
			toast.success(
				nextAction === "pull"
					? result.pulled
						? "Pulled Git changes."
						: "Already up to date."
					: result.pushed
						? "Pushed project changes."
						: "Already up to date.",
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Git ${nextAction} failed`);
		} finally {
			setAction(null);
		}
	};

	if (!data?.configured) {
		return null;
	}

	return (
		<>
			<ButtonGroup className="mr-2">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								variant="outline"
								size="icon"
								aria-label="Pull from Git"
								disabled={Boolean(action)}
								onClick={() => void runAction("pull")}
							>
								{action === "pull" ? <Loader2 className="animate-spin" /> : <ArrowDown />}
							</Button>
						}
					/>
					<TooltipContent>Pull from Git</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								variant="outline"
								size="icon"
								aria-label="Push to Git"
								disabled={Boolean(action)}
								onClick={() => void runAction("push")}
							>
								{action === "push" ? <Loader2 className="animate-spin" /> : <ArrowUp />}
							</Button>
						}
					/>
					<TooltipContent>Push to Git</TooltipContent>
				</Tooltip>
			</ButtonGroup>
			<Dialog
				open={conflicts.length > 0}
				onOpenChange={(open) => {
					if (!open && !action) {
						setConflicts([]);
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Resolve Git conflicts</DialogTitle>
						<DialogDescription>
							Choose which version to keep. Text changes that can be combined are merged
							automatically.
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-80 space-y-3 overflow-y-auto">
						{conflicts.map((conflict) => (
							<div key={conflict.path} className="space-y-2 rounded-lg border p-3">
								<p className="break-all font-mono font-medium">{conflict.path}</p>
								<p className="text-muted-foreground">
									{conflict.type === "remote-deleted"
										? "Deleted in Git, but changed in this project."
										: conflict.type === "add-add"
											? "Created independently in Git and this project."
											: "This non-text file changed in Git and this project."}
								</p>
								<ButtonGroup className="w-full">
									<Button
										type="button"
										variant={resolutions[conflict.path] === "project" ? "secondary" : "outline"}
										className="flex-1"
										disabled={Boolean(action)}
										onClick={() =>
											setResolutions((current) => ({
												...current,
												[conflict.path]: "project",
											}))
										}
									>
										Keep project
									</Button>
									<Button
										type="button"
										variant={resolutions[conflict.path] === "remote" ? "secondary" : "outline"}
										className="flex-1"
										disabled={Boolean(action)}
										onClick={() =>
											setResolutions((current) => ({
												...current,
												[conflict.path]: "remote",
											}))
										}
									>
										{conflict.type === "remote-deleted" ? "Delete file" : "Use Git version"}
									</Button>
								</ButtonGroup>
							</div>
						))}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={Boolean(action)}
							onClick={() => setConflicts([])}
						>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={Boolean(action)}
							onClick={() => void runAction("pull", resolutions)}
						>
							{action === "pull" && <Loader2 className="animate-spin" />}
							Resolve and pull
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function ProjectGitSetting({
	projectId,
	canWrite,
}: {
	projectId: string;
	canWrite: boolean;
}) {
	const url = `${API_URL}/projects/${projectId}/git`;
	const { data, mutate } = useSWR<ProjectGitConfig>(canWrite ? url : null, fetcher);
	const [remoteUrl, setRemoteUrl] = useState("");
	const [branch, setBranch] = useState("main");
	const [username, setUsername] = useState("");
	const [token, setToken] = useState("");
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (data) {
			setRemoteUrl(data.remoteUrl ?? "");
			setBranch(data.branch);
			setUsername(data.username ?? "");
		}
	}, [data]);

	const save = async () => {
		if (!remoteUrl.trim() || !branch.trim() || saving) {
			return;
		}

		setSaving(true);
		try {
			const response = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					remoteUrl: remoteUrl.trim(),
					branch: branch.trim(),
					username: username.trim() || undefined,
					token: token || undefined,
				}),
			});
			const result = (await response.json()) as ProjectGitConfig & { error?: string };
			if (!response.ok) {
				throw new Error(result.error ?? "Could not save Git settings");
			}

			await mutate(result, { revalidate: false });
			setToken("");
			setEditing(false);
			toast.success("Git settings saved.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not save Git settings");
		} finally {
			setSaving(false);
		}
	};

	const showSummary = data?.configured && !editing;

	return (
		<div className="space-y-2">
			<div className="px-1 text-xs font-medium">Git sync</div>
			{showSummary ? (
				<>
					<p
						className="truncate px-1 text-xs text-muted-foreground"
						title={data.remoteUrl ?? undefined}
					>
						{data.remoteUrl}
					</p>
					<div className="flex min-w-0 items-center justify-between gap-2 px-1">
						<p className="truncate text-xs text-muted-foreground">{data.branch}</p>
						<Button
							type="button"
							variant="link"
							size="xs"
							className="shrink-0 px-0"
							onClick={() => setEditing(true)}
						>
							Edit settings
						</Button>
					</div>
				</>
			) : (
				<>
					<Label htmlFor="git-remote-url" className="sr-only">
						Git remote URL
					</Label>
					<Input
						id="git-remote-url"
						type="url"
						value={remoteUrl}
						onChange={(event) => setRemoteUrl(event.target.value)}
						placeholder="https://github.com/user/repo.git"
						disabled={!canWrite || saving}
						aria-label="Git remote URL"
					/>
					<Input
						value={branch}
						onChange={(event) => setBranch(event.target.value)}
						placeholder="main"
						disabled={!canWrite || saving}
						aria-label="Git branch"
					/>
					<Input
						value={username}
						onChange={(event) => setUsername(event.target.value)}
						placeholder="Username (optional)"
						autoComplete="username"
						disabled={!canWrite || saving}
						aria-label="Git username"
					/>
					<Input
						type="password"
						value={token}
						onChange={(event) => setToken(event.target.value)}
						placeholder={data?.hasCredentials ? "Saved access token" : "Access token (optional)"}
						autoComplete="off"
						disabled={!canWrite || saving}
						aria-label="Git access token"
					/>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start"
						disabled={!canWrite || saving || !remoteUrl.trim() || !branch.trim()}
						onClick={() => void save()}
					>
						{saving ? <Loader2 className="animate-spin" /> : <GitBranch />}
						{saving ? "Saving…" : "Save Git settings"}
					</Button>
					{data?.configured && (
						<Button
							type="button"
							variant="ghost"
							className="w-full"
							disabled={saving}
							onClick={() => setEditing(false)}
						>
							Cancel
						</Button>
					)}
					<p className="px-1 text-xs text-muted-foreground">
						{canWrite
							? "The access token is encrypted and saved for future syncs."
							: "You need write access to configure Git sync."}
					</p>
				</>
			)}
		</div>
	);
}
