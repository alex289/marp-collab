import { throw404OnError, cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4-mini";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSidebar } from "@/components/file-sidebar";
import {
	useCollabDocument,
	usePresenceUser,
	useProjectPresence,
} from "@/hooks/use-collab-document";
import { useFiles } from "@/hooks/use-files";
import { useIncludedMarkdown } from "@/hooks/use-included-markdown";
import type { DeckFile } from "@/lib/types";
import Navbar from "@/components/navbar";
import { PresenceAvatars } from "@/components/presence-avatars";
import { PresentationActions } from "@/components/presentation-actions";
import { useProject } from "@/lib/project";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { PresentationFrame } from "@/components/presentation-frame";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EditorPaneHandle } from "@/components/editor-pane";
import { SearchPanel } from "@/components/search-panel";
import { findTextMatches, replaceTextRange, type TextSearchMatch } from "@/lib/text-search";
import { OutlinePanel } from "@/components/outline-panel";
import { parseMarkdownOutline } from "@/lib/outline";
import { countMarpSlides } from "@/lib/slide-count";
import { isEditableDeckFile, isMarkdownDeckFile } from "@/lib/file-types";
import { listThemeNames, rewriteCssUrls, setProjectThemes } from "@/lib/marp";
import { applyThemeToYText, getMarkdownTheme } from "@/lib/markdown-theme";
import { upsertProjectTheme, type ProjectTheme } from "@/lib/project-themes";
import { API_URL } from "@/lib/config";
import { releaseWakeLock, requestWakeLock } from "@/lib/wake-lock";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MonitorPlayIcon,
	PauseIcon,
	PlayIcon,
	XIcon,
} from "lucide-react";

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
	fullscreen: z.optional(z.boolean()),
});

type PresentationAwarenessState = {
	fileId: string;
	slideIndex: number;
	updatedAt: number;
	userId: string;
};

function parsePresentationAwarenessState(data: unknown): PresentationAwarenessState | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	const payload = data as Partial<PresentationAwarenessState>;
	if (
		typeof payload.fileId !== "string" ||
		typeof payload.slideIndex !== "number" ||
		!Number.isFinite(payload.slideIndex) ||
		typeof payload.updatedAt !== "number" ||
		!Number.isFinite(payload.updatedAt) ||
		typeof payload.userId !== "string"
	) {
		return null;
	}

	return {
		fileId: payload.fileId,
		slideIndex: Math.max(0, Math.trunc(payload.slideIndex)),
		updatedAt: payload.updatedAt,
		userId: payload.userId,
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
	const { project } = useProject(id);
	const [selectedFile, setSelectedFile] = useState<DeckFile | null>(null);
	const [previewFile, setPreviewFile] = useState<DeckFile | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [markdown, setMarkdown] = useState("");
	const [projectThemes, setProjectThemesState] = useState<ProjectTheme[]>([]);
	const [themeNames, setThemeNames] = useState<string[]>(() => listThemeNames());
	const [themeRevision, setThemeRevision] = useState(0);
	const [slideIndex, setSlideIndex] = useState(0);
	const [startedAt, setStartedAt] = useState(() => Date.now());
	const [now, setNow] = useState(() => Date.now());
	const [isTimerPaused, setIsTimerPaused] = useState(false);
	const [pausedElapsedMs, setPausedElapsedMs] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchMatches, setSearchMatches] = useState<TextSearchMatch[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const editorPaneRef = useRef<EditorPaneHandle | null>(null);
	const viewerContainerRef = useRef<HTMLDivElement | null>(null);
	const selectedCssFileIdRef = useRef<string | null>(null);
	const suppressNextSlideAwarenessUpdateRef = useRef(false);
	const lastAppliedPresentationUpdateRef = useRef(0);
	selectedCssFileIdRef.current = selectedFile?.id.toLowerCase().endsWith(".css")
		? selectedFile.id
		: null;

	const isPresentation = search.mode === "present" || search.mode === "viewer";
	const isViewer = search.mode === "viewer";
	const autoFullscreen = search.fullscreen === true;
	const outlineItems = useMemo(() => parseMarkdownOutline(markdown), [markdown]);
	// Rendering (preview, presentation, slide count) works on the markdown with
	// <!-- @include: file.md --> comments expanded; the editor keeps the raw text.
	const renderedMarkdown = useIncludedMarkdown(markdown, id, previewFile?.id ?? null);
	const slideCount = useMemo(() => countMarpSlides(renderedMarkdown), [renderedMarkdown]);

	useEffect(() => {
		if (files.length === 0) {
			setSelectedFile(null);
			return;
		}

		const requestedFile = search.file
			? files.find((f) => f.id === search.file && isMarkdownDeckFile(f))
			: null;

		const preferredDefault = () =>
			requestedFile ??
			files.find((f) => f.id === "presentation.md") ??
			files.find((f) => isMarkdownDeckFile(f)) ??
			files[0] ??
			null;

		if (!selectedFile) {
			setSelectedFile(preferredDefault());
			return;
		}

		const stillAvailable = files.some((file) => file.id === selectedFile.id);
		if (!stillAvailable && !isLoading) {
			setSelectedFile(preferredDefault());
		}
	}, [files, isLoading, search.file, selectedFile]);

	useEffect(() => {
		if (isMarkdownDeckFile(selectedFile)) {
			setPreviewFile(selectedFile);
			return;
		}

		setPreviewFile((current) => {
			if (current && files.some((file) => file.id === current.id && isMarkdownDeckFile(file))) {
				return current;
			}

			return files.find((file) => isMarkdownDeckFile(file)) ?? null;
		});
	}, [files, selectedFile]);

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
	const projectPresenceAwareness = useProjectPresence(
		id,
		session?.user ?? null,
		presenceUser,
		selectedFile?.id ?? null,
	);

	useEffect(() => {
		if (selectedFile?.id.endsWith(".css")) {
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
		const cssFiles = files.filter((file) => file.id.toLowerCase().endsWith(".css"));
		if (cssFiles.length === 0) {
			setProjectThemesState([]);
			return;
		}

		const controller = new AbortController();
		void (async () => {
			const themes = await Promise.all(
				cssFiles.map(async (file) => {
					try {
						const encodedId = file.id.split("/").map(encodeURIComponent).join("/");
						const res = await fetch(`${API_URL}/projects/${id}/files/${encodedId}`, {
							signal: controller.signal,
						});
						if (!res.ok) {
							return null;
						}
						return { id: file.id, css: rewriteCssUrls(await res.text(), id, file.id) };
					} catch {
						return null;
					}
				}),
			);

			if (controller.signal.aborted) {
				return;
			}

			setProjectThemesState((current) => {
				const loadedThemes = themes.filter(
					(theme): theme is { id: string; css: string } => theme !== null,
				);
				const activeCssFileId = selectedCssFileIdRef.current;
				const activeTheme = activeCssFileId
					? current.find((theme) => theme.id === activeCssFileId)
					: undefined;

				return activeTheme ? upsertProjectTheme(loadedThemes, activeTheme) : loadedThemes;
			});
		})();

		return () => controller.abort();
	}, [files, id]);

	useEffect(() => {
		setThemeNames(setProjectThemes(projectThemes));
		setThemeRevision((revision) => revision + 1);
	}, [projectThemes]);

	useEffect(() => {
		if (!selectedFile?.id.toLowerCase().endsWith(".css") || !collab.yText) {
			return;
		}

		const syncTheme = () => {
			// oxlint-disable-next-line no-base-to-string
			const css = rewriteCssUrls(collab.yText?.toString() ?? "", id, selectedFile.id);
			setProjectThemesState((current) =>
				upsertProjectTheme(current, {
					id: selectedFile.id,
					css,
				}),
			);
		};

		collab.yText.observe(syncTheme);

		return () => {
			collab.yText?.unobserve(syncTheme);
		};
	}, [collab.yText, id, selectedFile?.id]);

	const currentTheme = useMemo(() => getMarkdownTheme(markdown) ?? "default", [markdown]);

	const handleThemeChange = useCallback(
		(theme: string) => {
			if (collab.yText) {
				applyThemeToYText(collab.yText, theme);
			}
		},
		[collab.yText],
	);

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

			if (!isEditableDeckFile(selectedFile) || !collab.yText) {
				setSearchMatches([]);
				setSearchError("Open an editable file to search.");
				return;
			}

			// oxlint-disable-next-line no-base-to-string
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

		// oxlint-disable-next-line no-base-to-string
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

		if (!isEditableDeckFile(selectedFile) || !collab.yText || query.length === 0) {
			setSearchMatches([]);
			setSearchError("Open an editable file to replace.");
			return;
		}

		// oxlint-disable-next-line no-base-to-string
		const current = collab.yText.toString();
		const matches = findTextMatches(selectedFile.id, current, query, "active");
		const next = [...matches]
			.reverse()
			.reduce(
				(content, match) =>
					content.slice(0, match.startOffset) + replacement + content.slice(match.endOffset),
				current,
			);
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

		void requestWakeLock();

		return () => {
			void releaseWakeLock();
		};
	}, [isPresentation]);

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

			suppressNextSlideAwarenessUpdateRef.current = true;
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
	const [fullscreenPromptVisible, setFullscreenPromptVisible] = useState(autoFullscreen);

	const enterFullscreen = useCallback(() => {
		void (viewerContainerRef.current ?? document.documentElement).requestFullscreen();
		setFullscreenPromptVisible(false);
	}, []);

	const toggleViewerFullscreen = useCallback(() => {
		if (!isViewer) {
			return;
		}

		if (fullscreenPromptVisible) {
			enterFullscreen();
			return;
		}

		if (document.fullscreenElement) {
			void document.exitFullscreen();
			return;
		}

		void (viewerContainerRef.current ?? document.documentElement).requestFullscreen();
	}, [isViewer, fullscreenPromptVisible, enterFullscreen]);

	useEffect(() => {
		if (!isPresentation || selectedFile?.type !== "markdown" || !collab.awareness) {
			return;
		}

		const applyNewestPresentationState = () => {
			let newestState: PresentationAwarenessState | null = null;

			for (const state of collab.awareness?.getStates().values() ?? []) {
				const presentationState = parsePresentationAwarenessState(
					(state as { presentation?: unknown }).presentation,
				);
				if (!presentationState || presentationState.fileId !== selectedFile.id) {
					continue;
				}

				if (!newestState || presentationState.updatedAt > newestState.updatedAt) {
					newestState = presentationState;
				}
			}

			if (!newestState || newestState.updatedAt < lastAppliedPresentationUpdateRef.current) {
				return;
			}

			const nextSlideIndex = Math.min(newestState.slideIndex, maxSlideIndex);
			setSlideIndex((current) => {
				if (
					newestState.updatedAt === lastAppliedPresentationUpdateRef.current &&
					current === nextSlideIndex
				) {
					return current;
				}

				lastAppliedPresentationUpdateRef.current = newestState.updatedAt;
				if (current === nextSlideIndex) {
					return current;
				}

				suppressNextSlideAwarenessUpdateRef.current = true;
				return nextSlideIndex;
			});
		};

		applyNewestPresentationState();
		collab.awareness.on("change", applyNewestPresentationState);

		return () => {
			collab.awareness?.off("change", applyNewestPresentationState);
		};
	}, [collab.awareness, isPresentation, maxSlideIndex, selectedFile?.id, selectedFile?.type]);

	useEffect(() => {
		if (!collab.awareness) {
			return;
		}

		if (!isPresentation || selectedFile?.type !== "markdown") {
			collab.awareness.setLocalStateField("presentation", null);
			return;
		}

		return () => {
			collab.awareness?.setLocalStateField("presentation", null);
		};
	}, [collab.awareness, isPresentation, selectedFile?.id, selectedFile?.type]);

	useEffect(() => {
		if (!isPresentation || selectedFile?.type !== "markdown" || !collab.awareness) {
			return;
		}

		if (suppressNextSlideAwarenessUpdateRef.current) {
			suppressNextSlideAwarenessUpdateRef.current = false;
			return;
		}

		const updatedAt = Date.now();
		lastAppliedPresentationUpdateRef.current = updatedAt;
		collab.awareness.setLocalStateField("presentation", {
			fileId: selectedFile.id,
			slideIndex,
			updatedAt,
			userId: presenceUser.userId,
		} satisfies PresentationAwarenessState);
	}, [
		collab.awareness,
		isPresentation,
		presenceUser.userId,
		selectedFile?.id,
		selectedFile?.type,
		slideIndex,
	]);

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
				hotkey: "F",
				callback: toggleViewerFullscreen,
				options: { enabled: isViewer },
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
				markdown={renderedMarkdown}
				slideIndex={slideIndex}
				projectId={id}
				selectedFileId={selectedFile?.id ?? null}
				themeRevision={themeRevision}
				onMetaChange={({ active }) => {
					setSlideIndex(active);
				}}
				showSpeakerNotes={!isViewer}
				className="h-full w-full"
			/>
		);

		if (isViewer) {
			return (
				<div
					ref={viewerContainerRef}
					className="relative h-svh w-svw overflow-hidden bg-black text-white"
				>
					{frame}
					{fullscreenPromptVisible && (
						<div
							className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/70"
							onClick={enterFullscreen}
						>
							<p className="select-none text-xl font-medium text-white">
								Click to enter fullscreen
							</p>
							<p className="select-none text-sm text-white/50">Press Esc to exit</p>
						</div>
					)}
				</div>
			);
		}

		return (
			<div className="grid h-svh w-svw grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
				<div className="flex items-center justify-between gap-2 overflow-x-auto px-4 py-3 md:gap-3">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button variant="secondary" size="sm" onClick={() => setSlideIndex(0)}>
									Slide {slideIndex + 1}/{Math.max(slideCount, 1)}
								</Button>
							}
						/>
						<TooltipContent>Back to first slide</TooltipContent>
					</Tooltip>
					<div className="flex items-center gap-1 md:gap-2">
						<ButtonGroup>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											type="button"
											variant="secondary"
											aria-label={isTimerPaused ? "Resume timer" : "Pause timer"}
											onClick={isTimerPaused ? resumeTimer : pauseTimer}
										>
											{isTimerPaused ? <PlayIcon /> : <PauseIcon />}
										</Button>
									}
								/>
								<TooltipContent>{isTimerPaused ? "Resume timer" : "Pause timer"}</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											type="button"
											variant="secondary"
											aria-label="Reset timer"
											onClick={resetTimer}
										>
											{formatElapsed(elapsedMs)}
										</Button>
									}
								/>
								<TooltipContent>Reset timer</TooltipContent>
							</Tooltip>
						</ButtonGroup>
						<Separator orientation="vertical" />
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="md:h-7 md:w-auto md:gap-1 md:px-2 md:text-xs/relaxed"
							aria-label="Open clean screen"
							onClick={() => window.open(viewerUrl, "_blank", "noopener,noreferrer")}
						>
							<MonitorPlayIcon />
							<span className="hidden md:inline">Open clean screen</span>
						</Button>
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="md:h-7 md:w-auto md:gap-1 md:px-2 md:text-xs/relaxed"
							aria-label="End presentation"
							onClick={() =>
								void navigate({
									to: "/presentations/$id",
									params: { id },
									replace: true,
								})
							}
						>
							<XIcon />
							<span className="hidden md:inline">End presentation</span>
						</Button>
					</div>
				</div>

				<div className="min-h-0">{frame}</div>

				<div className="flex justify-between gap-3 px-4 py-3">
					<Button
						type="button"
						variant="secondary"
						className="max-md:h-14 max-md:flex-1 max-md:text-base"
						onClick={() => setSlideIndex((current) => Math.max(current - 1, 0))}
						disabled={slideIndex <= 0}
					>
						<ChevronLeftIcon />
						Previous
					</Button>
					<Button
						type="button"
						variant="secondary"
						className="max-md:h-14 max-md:flex-1 max-md:text-base"
						onClick={() => setSlideIndex((current) => Math.min(current + 1, maxSlideIndex))}
						disabled={slideIndex >= maxSlideIndex}
					>
						Next
						<ChevronRightIcon />
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
			<Navbar
				breadcrumb={{
					projectName: project?.name ?? null,
					fileName: selectedFile?.label ?? null,
					status: collab.status,
				}}
				actions={
					<>
						<PresenceAvatars awareness={projectPresenceAwareness} />
						<PresentationActions
							projectId={id}
							selectedFileId={previewFile?.id ?? null}
							fileLabel={previewFile?.label ?? null}
						/>
					</>
				}
			/>
			<main
				className={cn(
					"grid min-h-0 flex-1 grid-cols-1 overflow-hidden max-md:grid-rows-[auto_minmax(0,3fr)_minmax(0,2fr)]",
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
					themeNames={themeNames}
					currentTheme={currentTheme}
					onThemeChange={handleThemeChange}
					themeSelectDisabled={!isMarkdownDeckFile(selectedFile) || collab.readOnly}
					onProjectDeleted={() => {
						void navigate({ to: "/", replace: true });
					}}
					presenceAwareness={projectPresenceAwareness}
					currentUserId={presenceUser.userId}
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
							isMarkdown={isMarkdownDeckFile(selectedFile)}
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
						readOnly={collab.readOnly}
						projectId={id}
					/>
				</Suspense>

				<Suspense>
					<PreviewPane
						markdown={renderedMarkdown}
						label={previewFile?.label ?? null}
						projectId={id}
						themeRevision={themeRevision}
						selectedFileId={previewFile?.id ?? null}
					/>
				</Suspense>
			</main>
		</div>
	);
}
