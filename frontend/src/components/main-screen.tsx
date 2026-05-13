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
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function MainScreen({ sessionUser }: { sessionUser: SessionUser }) {
	const presenceUser = usePresenceUser(sessionUser);
	const { files, isLoading, error, reload } = useFiles();
	const [selectedFile, setSelectedFile] = useState<DeckFile | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);
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
				<Card>
					<CardHeader>
						<CardTitle>Marp Collab</CardTitle>
						<CardDescription>Collaborative Markdown editor for Marp decks</CardDescription>
						<CardAction>
							<Badge variant="secondary" className="inline-flex items-center gap-2">
								<CircleUserRound className="h-4 w-4" />
								Presence as <strong>{presenceUser.userName}</strong>
								<span
									className="h-2.5 w-2.5 rounded-full"
									style={{ backgroundColor: presenceUser.color }}
								/>
							</Badge>
						</CardAction>
					</CardHeader>
					<CardContent className="flex justify-between">
						<Badge variant="secondary" className="text-xs">
							Workspace: main
						</Badge>
						<AuthPanel />
					</CardContent>
				</Card>

				<main
					className={cn(
						"grid min-h-[76vh] gap-3 grid-cols-1",
						sidebarOpen
							? "xl:grid-cols-[250px_minmax(0,1fr)_minmax(320px,42%)]"
							: "xl:grid-cols-[60px_minmax(0,1fr)_minmax(320px,42%)]",
					)}
				>
					<FileSidebar
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
