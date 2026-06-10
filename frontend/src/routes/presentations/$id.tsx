import { throw404OnError, cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4-mini";
import { lazy, Suspense, useEffect, useState } from "react";
import { FileSidebar } from "@/components/file-sidebar";
import { useCollabDocument, usePresenceUser } from "@/hooks/use-collab-document";
import { useFiles } from "@/hooks/use-files";
import type { DeckFile } from "@/lib/types";
import Navbar from "@/components/navbar";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { PresentationFrame } from "@/components/presentation-frame";
import { Button } from "@/components/ui/button";

const EditorPane = lazy(async () => {
	const m = await import("@/components/editor-pane");
	return { default: m.EditorPane };
});
const PreviewPane = lazy(async () => {
	const m = await import("@/components/preview-pane");
	return { default: m.PreviewPane };
});

const paramsValidator = z.object({
	id: z.uuid(),
});

const searchValidator = z.object({
	mode: z.optional(z.enum(["present", "viewer"])),
	file: z.optional(z.string()),
});

export const Route = createFileRoute("/presentations/$id")({
	component: RouteComponent,
	params: {
		parse: throw404OnError((data) => paramsValidator.parse(data)),
	},
	validateSearch: (search) => searchValidator.parse(search),
});

function formatElapsed(ms: number) {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function RouteComponent() {
	const { session } = Route.useRouteContext();

	const { id } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const presenceUser = usePresenceUser(session?.user ?? null);
	const { files, isLoading, error, reload } = useFiles(id);
	const [selectedFile, setSelectedFile] = useState<DeckFile | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [markdown, setMarkdown] = useState("");
	const [slideIndex, setSlideIndex] = useState(0);
	const [slideCount, setSlideCount] = useState(1);
	const [startedAt, setStartedAt] = useState(() => Date.now());
	const [now, setNow] = useState(() => Date.now());

	const isPresentation = search.mode === "present" || search.mode === "viewer";
	const isViewer = search.mode === "viewer";

	useEffect(() => {
		if (files.length === 0) {
			setSelectedFile(null);
			return;
		}

		const requestedFile = search.file
			? files.find((f) => f.id === search.file && f.type === "markdown")
			: null;

		const preferredDefault = () =>
			requestedFile ??
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
	}, [files, search.file, selectedFile]);

	const collab = useCollabDocument(
		selectedFile?.type === "markdown" ? (selectedFile.documentName ?? null) : null,
		session?.user ?? null,
		presenceUser,
		(payload) => {
			if (payload === "files-changed") {
				void reload();
			}
		},
	);

	useEffect(() => {
		if (selectedFile?.id.endsWith(".css")) {
			setMarkdown("");
			return;
		}

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
	}, [collab.yText, selectedFile?.id]);

	useEffect(() => {
		if (!isPresentation) {
			return;
		}

		setStartedAt(Date.now());
		setNow(Date.now());
		const interval = window.setInterval(() => setNow(Date.now()), 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, [isPresentation]);

	useEffect(() => {
		if (slideCount <= 0) {
			setSlideIndex(0);
			return;
		}

		setSlideIndex((prev) => Math.min(prev, slideCount - 1));
	}, [slideCount]);

	const maxSlideIndex = Math.max(0, slideCount - 1);

	useHotkeys(
		[
			{
				hotkey: "ArrowRight",
				callback: () => setSlideIndex((current) => Math.min(current + 1, maxSlideIndex)),
			},
			{
				hotkey: "ArrowDown",
				callback: () => setSlideIndex((current) => Math.min(current + 1, maxSlideIndex)),
			},
			{
				hotkey: "PageDown",
				callback: () => setSlideIndex((current) => Math.min(current + 1, maxSlideIndex)),
			},
			{
				hotkey: "Space",
				callback: () => setSlideIndex((current) => Math.min(current + 1, maxSlideIndex)),
			},
			{
				hotkey: "ArrowLeft",
				callback: () => setSlideIndex((current) => Math.max(current - 1, 0)),
			},
			{
				hotkey: "ArrowUp",
				callback: () => setSlideIndex((current) => Math.max(current - 1, 0)),
			},
			{
				hotkey: "PageUp",
				callback: () => setSlideIndex((current) => Math.max(current - 1, 0)),
			},
			{
				hotkey: "Escape",
				callback: () => {
					if (isViewer && window.opener) {
						window.close();
						return;
					}

					void navigate({
						to: "/presentations/$id",
						params: { id },
						replace: true,
					});
				},
			},
		],
		{ enabled: isPresentation },
	);

	if (isPresentation) {
		const viewerUrl = `/presentations/${id}?mode=viewer${selectedFile?.id ? `&file=${encodeURIComponent(selectedFile.id)}` : ""}`;

		return (
			<div className="relative h-screen w-screen overflow-hidden bg-black text-white">
				<PresentationFrame
					markdown={markdown}
					slideIndex={slideIndex}
					onMetaChange={({ active, total }) => {
						setSlideIndex(active);
						setSlideCount(Math.max(total, 1));
					}}
					className="h-full w-full"
				/>

				{isViewer ? null : (
					<>
						<div className="pointer-events-none absolute inset-x-4 top-4 flex items-center justify-between">
							<Button
								className="pointer-events-auto"
								variant="secondary"
								size="sm"
								onClick={() => setSlideIndex(0)}
							>
								Slide {slideIndex + 1}/{Math.max(slideCount, 1)}
							</Button>
							<div className="pointer-events-auto flex items-center gap-2">
								<Button type="button" variant="secondary" onClick={() => setStartedAt(Date.now())}>
									{formatElapsed(now - startedAt)}
								</Button>
								<Button
									type="button"
									variant="secondary"
									onClick={() => window.open(viewerUrl, "_blank", "noopener,noreferrer")}
								>
									Open clean screen
								</Button>
								<Button
									type="button"
									variant="secondary"
									onClick={() =>
										void navigate({
											to: "/presentations/$id",
											params: { id },
											replace: true,
										})
									}
								>
									End presentation
								</Button>
							</div>
						</div>

						<div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-between">
							<Button
								type="button"
								variant="secondary"
								className="pointer-events-auto"
								onClick={() => setSlideIndex((current) => Math.max(current - 1, 0))}
								disabled={slideIndex <= 0}
							>
								Previous
							</Button>
							<Button
								type="button"
								variant="secondary"
								className="pointer-events-auto"
								onClick={() => setSlideIndex((current) => Math.min(current + 1, maxSlideIndex))}
								disabled={slideIndex >= maxSlideIndex}
							>
								Next
							</Button>
						</div>
					</>
				)}
			</div>
		);
	}

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

					<Suspense>
						<EditorPane
							label={selectedFile?.label ?? null}
							yText={collab.yText}
							awareness={collab.awareness}
							undoManager={collab.undoManager}
							status={collab.status}
						/>
					</Suspense>

					<Suspense>
						<PreviewPane
							markdown={markdown}
							label={selectedFile?.label ?? null}
							projectId={id}
							selectedFileId={selectedFile?.id ?? null}
						/>
					</Suspense>
				</main>
			</div>
		</div>
	);
}
