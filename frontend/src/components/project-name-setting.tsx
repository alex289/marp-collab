import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "./ui/label";
import { updateProject, useProject } from "@/lib/project";
import { useRouter } from "@tanstack/react-router";

type ProjectNameSettingProps = {
	projectId: string;
};

export const ProjectNameSetting = ({ projectId }: ProjectNameSettingProps) => {
	const { project, isProjectOwner: isOwner, mutate } = useProject(projectId);
	const router = useRouter();

	const [name, setName] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const currentName = project?.name ?? "";

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

		const res = await updateProject(projectId, { name: trimmed });

		setSaving(false);

		if (!res.ok) {
			setError("Could not rename project.");
			return;
		}

		await mutate();
		await router.invalidate();
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
					variant="default"
					onClick={() => void handleSave()}
					disabled={!canSave}
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
