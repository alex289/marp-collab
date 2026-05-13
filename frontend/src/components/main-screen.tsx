import { useEffect, useState } from "react";
import { CircleUserRound } from "lucide-react";
import { AuthPanel } from "@/components/auth-panel";
import { FileSidebar } from "@/components/file-sidebar";
import { PreviewPane } from "@/components/preview-pane";
import { Badge } from "@/components/ui/badge";
import { useCollabDocument, usePresenceUser } from "@/hooks/use-collab-document";
import { useFiles } from "@/hooks/use-files";
import type { DeckFile, SessionUser } from "@/lib/types";
import { EditorPane } from "./editor-pane";

export function MainScreen({ sessionUser }: { sessionUser: SessionUser }) {
	const presenceUser = usePresenceUser(sessionUser);
	const { files, isLoading, error, reload } = useFiles();
	const [selectedFile, setSelectedFile] = useState<DeckFile | null>(null);
	const [markdown, setMarkdown] = useState("");

	useEffect(() => {
		if (files.length === 0) {
			setSelectedFile(null);
			return;
		}

		if (!selectedFile) {
			setSelectedFile(files[0] ?? null);
			return;
		}

		const stillAvailable = files.some((file) => file.id === selectedFile.id);
		if (!stillAvailable) {
			setSelectedFile(files[0] ?? null);
		}
	}, [files, selectedFile]);

	const collab = useCollabDocument(selectedFile?.documentName ?? null, presenceUser);

	useEffect(() => {
		if (!collab.yText) {
			setMarkdown("");
			return;
		}

		const sync = () => {
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
				<header className="rounded-xl border border-border bg-card/85 p-4 shadow-panel backdrop-blur">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<div>
							<h1 className="text-2xl font-bold tracking-tight md:text-3xl">Marp Collab</h1>
							<p className="text-sm text-muted-foreground">
								Collaborative Markdown editor for Marp decks
							</p>
						</div>

						<div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs">
							<CircleUserRound className="h-4 w-4" />
							Presence as <strong>{presenceUser.userName}</strong>
							<span
								className="h-2.5 w-2.5 rounded-full"
								style={{ backgroundColor: presenceUser.color }}
							/>
						</div>
					</div>

					<div className="flex flex-wrap items-start justify-between gap-3">
						<Badge variant="secondary" className="text-xs">
							Workspace: main
						</Badge>
						<AuthPanel />
					</div>
				</header>

				<main className="grid min-h-[76vh] grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)_minmax(320px,42%)]">
					<FileSidebar
						files={files}
						selectedFileId={selectedFile?.id ?? null}
						onSelectFile={setSelectedFile}
						isLoading={isLoading}
						error={error}
						onRetry={reload}
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
