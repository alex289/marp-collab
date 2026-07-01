import { useEffect, useState } from "react";
import useSWR from "swr";
import { API_URL } from "@/lib/config";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "./ui/label";

type ProjectResponse = {
	project: { id: string; name: string };
	isOwner: boolean;
};

const credentialedFetcher = async (url: string): Promise<ProjectResponse> => {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Request failed: ${res.status} ${res.statusText}`);
	}
	return res.json() as Promise<ProjectResponse>;
};

type ProjectNameSettingProps = {
	projectId: string;
};

export const ProjectNameSetting = ({ projectId }: ProjectNameSettingProps) => {
	const key = `${API_URL}/projects/${projectId}`;
	const { data, mutate } = useSWR<ProjectResponse>(key, credentialedFetcher);

	const [name, setName] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const currentName = data?.project.name ?? "";
	const isOwner = data?.isOwner ?? false;

	useEffect(() => {
		setName(currentName);
	}, [currentName]);

	const trimmed = name.trim();
	const canSave = isOwner && !saving && trimmed.length > 0 && trimmed !== currentName;

	const handleSave = async () => {
		if (!canSave) {
			return;
		}

		setSaving(true);
		setError(null);

		const res = await fetch(key, {
			method: "PATCH",

			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: trimmed }),
		});

		setSaving(false);

		if (!res.ok) {
			setError("Could not rename project.");
			return;
		}

		await mutate();
	};

	return (
		<div className="space-y-1.5">
			<Label htmlFor="project-name" className="px-1 text-xs font-medium">
				Project name
			</Label>
			<div className="flex items-center gap-1.5">
				<Input
					id="project-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							void handleSave();
						}
					}}
					disabled={!isOwner || saving}
					maxLength={255}
					aria-label="Project name"
				/>
				<Button
					type="button"
					size="sm"
					variant="default"
					onClick={() => void handleSave()}
					disabled={!canSave}
					className="h-7 px-2"
				>
					Save
				</Button>
			</div>
			<p className="px-1 text-xs text-muted-foreground">
				{error ? error : isOwner ? "Rename the project." : "Only the project owner can rename it."}
			</p>
		</div>
	);
};
