import { throw404OnError, cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4-mini";
import { useEffect, useState } from "react";
import { FileSidebar } from "@/components/file-sidebar";
import { PreviewPane } from "@/components/preview-pane";
import { useCollabDocument, usePresenceUser } from "@/hooks/use-collab-document";
import { useFiles } from "@/hooks/use-files";
import type { DeckFile } from "@/lib/types";
import { EditorPane } from "@/components/editor-pane";
import Navbar from "@/components/navbar";

const paramsValidator = z.object({
	id: z.uuid(),
});

export const Route = createFileRoute("/presentations/$id")({
	component: RouteComponent,
	params: {
		parse: throw404OnError((data) => paramsValidator.parse(data)),
	},
});

function RouteComponent() {
	const { session } = Route.useRouteContext();

	const { id } = Route.useParams();
	const presenceUser = usePresenceUser(session?.user ?? null);
	const { files, isLoading, error, reload } = useFiles(id);
	const [selectedFile, setSelectedFile] = useState<DeckFile | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [markdown, setMarkdown] = useState("");

	useEffect(() => {
		if (files.length === 0) {
			setSelectedFile(null);
			return;
		}

		const preferredDefault = () =>
			files.find((f) => f.id === "presentation.md") ??
			files.find((f) => f.type === "markdown") ??
			files[0] ??
			null;

		if (!selectedFile) {
			setSelectedFile(preferredDefault());
			return;
		}

		const stillAvailable = files.some((file) => file.id === selectedFile.id);
		if (!stillAvailable) {
			setSelectedFile(preferredDefault());
		}
	}, [files, selectedFile]);

	const collab = useCollabDocument(
		selectedFile?.type === "markdown" ? (selectedFile.documentName ?? null) : null,
		session?.user ?? null,
		presenceUser,
	);

	useEffect(() => {
		if (!collab.yText) {
			setMarkdown("");
			return;
		}

		const sync = () => {
			// oxlint-disable-next-line no-base-to-string
			setMarkdown(collab.yText?.toString() ?? "");
		};

		sync();
		collab.yText.observe(sync);

		return () => {
			collab.yText?.unobserve(sync);
		};
	}, [collab.yText]);

	return (
		<div className="min-h-screen bg-halo pb-4 pt-6 text-foreground">
			<div className="mx-auto flex w-[min(1440px,96vw)] flex-col gap-4">
				<Navbar />
				<main
					className={cn(
						"grid min-h-[76vh] gap-3 grid-cols-1",
						sidebarOpen
							? "xl:grid-cols-[250px_minmax(0,1fr)_minmax(320px,42%)]"
							: "xl:grid-cols-[60px_minmax(0,1fr)_minmax(320px,42%)]",
					)}
				>
					<FileSidebar
						projectId={id}
						files={files}
						selectedFileId={selectedFile?.id ?? null}
						onSelectFile={setSelectedFile}
						isLoading={isLoading}
						error={error}
						onRetry={reload}
						sidebarOpen={sidebarOpen}
						setSidebarOpen={setSidebarOpen}
					/>

					<EditorPane
						label={selectedFile?.label ?? null}
						yText={collab.yText}
						awareness={collab.awareness}
						undoManager={collab.undoManager}
						status={collab.status}
					/>

					<PreviewPane markdown={markdown} label={selectedFile?.label ?? null} />
				</main>
			</div>
		</div>
	);
}
