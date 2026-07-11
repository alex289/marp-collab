import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileDownIcon, Loader2Icon, PresentationIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/config";
import { getSecondaryScreen } from "@/lib/screen-management";
import { useProject } from "@/lib/project";

type PresentationActionsProps = {
	projectId: string;
	selectedFileId: string | null;
	fileLabel: string | null;
};

export const PresentationActions = ({
	projectId,
	selectedFileId,
	fileLabel,
}: PresentationActionsProps) => {
	const navigate = useNavigate();
	const [isExportingPdf, setIsExportingPdf] = useState(false);
	const { project } = useProject(projectId);

	const handleStartPresentation = useCallback(async () => {
		const secondaryScreen = await getSecondaryScreen();

		if (secondaryScreen) {
			const viewerPath = `/presentations/${projectId}?mode=viewer&fullscreen=true${selectedFileId ? `&file=${encodeURIComponent(selectedFileId)}` : ""}`;
			window.open(
				viewerPath,
				"_blank",
				`left=${secondaryScreen.left},top=${secondaryScreen.top},width=${secondaryScreen.width},height=${secondaryScreen.height}`,
			);
		}

		void navigate({
			to: "/presentations/$id",
			params: { id: projectId },
			search: { mode: "present", file: selectedFileId ?? undefined },
		});
	}, [navigate, projectId, selectedFileId]);

	const handleExportPdf = useCallback(async () => {
		if (!selectedFileId || isExportingPdf) {
			return;
		}
		setIsExportingPdf(true);
		try {
			const response = await fetch(
				`${API_URL}/projects/${projectId}/export/pdf/${encodeURIComponent(selectedFileId)}`,
			);
			if (!response.ok) {
				throw new Error(`Could not export PDF (${response.status})`);
			}

			// Sadly there is still no way to download a file in a good way
			// across browsers while tracking the download progress.
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);

			const link = document.createElement("a");
			link.href = url;
			link.download = project?.name ? `${project.name}.pdf` : "presentation.pdf";
			document.body.append(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not export PDF");
		} finally {
			setIsExportingPdf(false);
		}
	}, [projectId, selectedFileId, isExportingPdf, project?.name]);

	if (!fileLabel) {
		return (
			<Button variant="ghost" size="sm" disabled>
				<PresentationIcon />
				Start presentation
			</Button>
		);
	}

	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				disabled={isExportingPdf}
				onClick={() => void handleExportPdf()}
			>
				{isExportingPdf ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />}
				Export PDF
			</Button>
			<Button variant="ghost" size="sm" onClick={() => void handleStartPresentation()}>
				<PresentationIcon />
				Start presentation
			</Button>
		</>
	);
};
