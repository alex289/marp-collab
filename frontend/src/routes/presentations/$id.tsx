import { throw404OnError, cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4-mini";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FileSidebar } from "@/components/file-sidebar";
import { useCollabDocument, usePresenceUser } from "@/hooks/use-collab-document";
import { useFiles } from "@/hooks/use-files";
import type { DeckFile } from "@/lib/types";
import Navbar from "@/components/navbar";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { PresentationFrame } from "@/components/presentation-frame";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { EditorPaneHandle } from "@/components/editor-pane";
import { SearchPanel } from "@/components/search-panel";
import { findTextMatches, replaceTextRange, type TextSearchMatch } from "@/lib/text-search";
import { OutlinePanel } from "@/components/outline-panel";
import { parseMarkdownOutline } from "@/lib/outline";

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

const PRESENTATION_SYNC_CHANNEL_PREFIX = "marp-collab-presentation";

type PresentationSlideSyncMessage = {
	type: "presentation-slide";
	slideIndex: number;
};

function parseSlideSyncMessage(data: unknown): PresentationSlideSyncMessage | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	const payload = data as Partial<PresentationSlideSyncMessage>;
	const slideIndex = payload.slideIndex;
	if (
		payload.type !== "presentation-slide" ||
		typeof slideIndex !== "number" ||
		!Number.isFinite(slideIndex)
	) {
		return null;
	}

	return {
		type: "presentation-slide",
		slideIndex: Math.max(0, Math.trunc(slideIndex)),
	};
}

function normalizeSearchSlide(slide: unknown) {
	if (slide === undefined || slide === null || slide === "") {
		return null;
	}

	const index =
		typeof slide === "number"
			? slide
			: typeof slide === "string"
				? Number.parseInt(slide, 10)
				: Number.NaN;
	return Number.isFinite(index) ? Math.max(0, index) : null;
}

export const Route = createFileRoute("/presentations/$id")({
	component: RouteComponent,
	params: {
		parse: throw404OnError((data) => paramsValidator.parse(data)),
	},
	validateSearch: (search) => {
		const slide = normalizeSearchSlide((search as { slide?: unknown }).slide);

		return {
			...searchValidator.parse(search),
			...(slide === null ? {} : { slide }),
		};
	},
});

function formatElapsed(ms: number) {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
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
	const [isTimerPaused, setIsTimerPaused] = useState(false);
	const [pausedElapsedMs, setPausedElapsedMs] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchMatches, setSearchMatches] = useState<TextSearchMatch[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const editorPaneRef = useRef<EditorPaneHandle | null>(null);
	const slideSyncChannelRef = useRef<BroadcastChannel | null>(null);
	const suppressNextSlideBroadcastRef = useRef(false);

	const isPresentation = search.mode === "present" || search.mode === "viewer";
	const isViewer = search.mode === "viewer";
	const slideSyncChannelName =
		isPresentation && selectedFile?.type === "markdown"
			? `${PRESENTATION_SYNC_CHANNEL_PREFIX}:${id}:${selectedFile.id}`
			: null;
	const outlineItems = useMemo(() => parseMarkdownOutline(markdown), [markdown]);

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
		setSearchMatches([]);
		setSearchError(null);
	}, [selectedFile?.id]);

	const runActiveFileSearch = (query: string) => {
		setSearchQuery(query);
		setSearchLoading(true);
		setSearchError(null);

		try {
			if (!query) {
				setSearchMatches([]);
				return;
			}

			if (selectedFile?.type !== "markdown" || !collab.yText) {
				setSearchMatches([]);
				setSearchError("Open an editable file to search.");
				return;
			}

			setSearchMatches(findTextMatches(selectedFile.id, collab.yText.toString(), query, "active"));
		} catch (requestError) {
			setSearchError(requestError instanceof Error ? requestError.message : "Search failed");
		} finally {
			setSearchLoading(false);
		}
	};

	const replaceActiveMatch = (match: TextSearchMatch, replacement: string) => {
		if (!collab.yText) {
			return false;
		}

		const current = collab.yText.toString();
		const result = replaceTextRange(
			current,
			{
				startOffset: match.startOffset,
				endOffset: match.endOffset,
				expectedText: match.matchedText,
			},
			replacement,
		);
		if (result.status === "stale") {
			setSearchError("Result changed. Search again.");
			return false;
		}

		const applyReplacement = () => {
			collab.yText?.delete(match.startOffset, match.endOffset - match.startOffset);
			collab.yText?.insert(match.startOffset, replacement);
		};
		if (collab.yText.doc) {
			collab.yText.doc.transact(applyReplacement);
		} else {
			applyReplacement();
		}
		return true;
	};

	const handleReplaceOne = (match: TextSearchMatch, replacement: string) => {
		setSearchError(null);

		if (match.source === "active") {
			if (replaceActiveMatch(match, replacement)) {
				runActiveFileSearch(searchQuery);
			}
			return;
		}

		setSearchError("Result changed. Search again.");
	};

	const handleReplaceAll = (query: string, replacement: string) => {
		setSearchError(null);

		if (selectedFile?.type !== "markdown" || !collab.yText || query.length === 0) {
			setSearchMatches([]);
			setSearchError("Open an editable file to replace.");
			return;
		}

		const current = collab.yText.toString();
		const next = current.split(query).join(replacement);
		const applyReplacement = () => {
			collab.yText?.delete(0, collab.yText.length);
			collab.yText?.insert(0, next);
		};
		if (collab.yText.doc) {
			collab.yText.doc.transact(applyReplacement);
		} else {
			applyReplacement();
		}

		runActiveFileSearch(query);
	};

	useEffect(() => {
		if (!isPresentation) {
			return;
		}

		const currentTime = Date.now();
		setStartedAt(currentTime);
		setNow(currentTime);
		setIsTimerPaused(false);
		setPausedElapsedMs(0);
	}, [isPresentation]);

	useEffect(() => {
		if (!isPresentation || isTimerPaused) {
			return;
		}

		const interval = window.setInterval(() => setNow(Date.now()), 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, [isPresentation, isTimerPaused]);

	useEffect(() => {
		if (!isPresentation) {
			return;
		}

		const initialSlide = search.slide ?? null;
		if (initialSlide === null) {
			return;
		}

		setSlideIndex((current) => {
			if (current === initialSlide) {
				return current;
			}

			suppressNextSlideBroadcastRef.current = true;
			return initialSlide;
		});
	}, [isPresentation, search.slide]);

	useEffect(() => {
		if (slideCount <= 0) {
			setSlideIndex(0);
			return;
		}

		setSlideIndex((prev) => Math.min(prev, slideCount - 1));
	}, [slideCount]);

	const maxSlideIndex = Math.max(0, slideCount - 1);

	useEffect(() => {
		if (!slideSyncChannelName) {
			slideSyncChannelRef.current?.close();
			slideSyncChannelRef.current = null;
			return;
		}

		const channel = new BroadcastChannel(slideSyncChannelName);
		slideSyncChannelRef.current = channel;

		const onMessage = (event: MessageEvent) => {
			const message = parseSlideSyncMessage(event.data);
			if (!message) {
				return;
			}

			setSlideIndex((current) => {
				if (current === message.slideIndex) {
					return current;
				}

				suppressNextSlideBroadcastRef.current = true;
				return message.slideIndex;
			});
		};

		channel.addEventListener("message", onMessage);

		return () => {
			channel.removeEventListener("message", onMessage);
			channel.close();
			if (slideSyncChannelRef.current === channel) {
				slideSyncChannelRef.current = null;
			}
		};
	}, [slideSyncChannelName]);

	useEffect(() => {
		if (!slideSyncChannelName) {
			return;
		}

		if (suppressNextSlideBroadcastRef.current) {
			suppressNextSlideBroadcastRef.current = false;
			return;
		}

		slideSyncChannelRef.current?.postMessage({
			type: "presentation-slide",
			slideIndex,
		} satisfies PresentationSlideSyncMessage);
	}, [slideIndex, slideSyncChannelName]);

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
		const viewerUrl = `/presentations/${id}?mode=viewer&slide=${slideIndex}${selectedFile?.id ? `&file=${encodeURIComponent(selectedFile.id)}` : ""}`;
		const elapsedMs = isTimerPaused ? pausedElapsedMs : now - startedAt;
		const resetTimer = () => {
			const currentTime = Date.now();
			setStartedAt(currentTime);
			setNow(currentTime);
			setPausedElapsedMs(0);
			setIsTimerPaused(false);
		};
		const pauseTimer = () => {
			const currentTime = Date.now();
			setNow(currentTime);
			setPausedElapsedMs(Math.max(0, currentTime - startedAt));
			setIsTimerPaused(true);
		};
		const resumeTimer = () => {
			const currentTime = Date.now();
			setStartedAt(currentTime - pausedElapsedMs);
			setNow(currentTime);
			setIsTimerPaused(false);
		};
		const frame = (
			<PresentationFrame
				markdown={markdown}
				slideIndex={slideIndex}
				onMetaChange={({ active, total }) => {
					setSlideIndex(active);
					setSlideCount(Math.max(total, 1));
				}}
				showSpeakerNotes={!isViewer}
				className="h-full w-full"
			/>
		);

		if (isViewer) {
			return <div className="h-screen w-screen overflow-hidden bg-black text-white">{frame}</div>;
		}

		return (
			<div className="grid h-screen w-screen grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
				<div className="flex items-center justify-between gap-3 px-4 py-3">
					<Button variant="secondary" size="sm" onClick={() => setSlideIndex(0)}>
						Slide {slideIndex + 1}/{Math.max(slideCount, 1)}
					</Button>
					<div className="flex items-center gap-2">
						<Button type="button" variant="secondary" onClick={resetTimer}>
							{formatElapsed(elapsedMs)}
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={isTimerPaused ? resumeTimer : pauseTimer}
						>
							{isTimerPaused ? "Resume timer" : "Pause timer"}
						</Button>
						<Separator orientation="vertical" />
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

				<div className="min-h-0">{frame}</div>

				<div className="flex justify-between gap-3 px-4 py-3">
					<Button
						type="button"
						variant="secondary"
						onClick={() => setSlideIndex((current) => Math.max(current - 1, 0))}
						disabled={slideIndex <= 0}
					>
						Previous
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={() => setSlideIndex((current) => Math.min(current + 1, maxSlideIndex))}
						disabled={slideIndex >= maxSlideIndex}
					>
						Next
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-halo pb-4 pt-2 text-foreground">
			<div className="mx-auto flex px-6 flex-col gap-4">
				<Navbar />
				<main
					className={cn(
						"grid min-h-[76vh] gap-2 grid-cols-1",
						sidebarOpen
							? "xl:grid-cols-[304px_minmax(0,1fr)_minmax(320px,42%)]"
							: "xl:grid-cols-[48px_minmax(0,1fr)_minmax(320px,42%)]",
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
						searchPanel={
							<SearchPanel
								matches={searchMatches}
								isLoading={searchLoading}
								error={searchError}
								onSearch={(query) => {
									runActiveFileSearch(query);
								}}
								onReplaceOne={(match, replacement) => {
									handleReplaceOne(match, replacement);
								}}
								onReplaceAll={(query, replacement) => {
									handleReplaceAll(query, replacement);
								}}
							/>
						}
						outlinePanel={
							<OutlinePanel
								items={outlineItems}
								isMarkdown={selectedFile?.type === "markdown" && !selectedFile.id.endsWith(".css")}
								onSelectLine={(line) => editorPaneRef.current?.jumpToLine(line)}
							/>
						}
					/>

					<Suspense>
						<EditorPane
							ref={editorPaneRef}
							label={selectedFile?.label ?? null}
							yText={collab.yText}
							awareness={collab.awareness}
							undoManager={collab.undoManager}
							status={collab.status}
							projectId={id}
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
