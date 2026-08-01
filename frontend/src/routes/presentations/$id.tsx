import { throw404OnError, cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4-mini";
import * as Y from "yjs";
import { toast } from "sonner";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSidebar } from "@/components/file-sidebar";
import {
	useCollabDocument,
	usePresenceUser,
	useProjectPresence,
} from "@/hooks/use-collab-document";
import type { DeckFile } from "@/lib/types";
import Navbar from "@/components/navbar";
import { PresenceAvatars } from "@/components/presence-avatars";
import { PresentationActions } from "@/components/presentation-actions";
import { ManageProjectCollaborator } from "@/components/dialog/manage-project-collaborator";
import { getProject } from "@/lib/project";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { PresentationFrame } from "@/components/presentation-frame";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EditorPaneHandle, MarkdownImageUploadResult } from "@/components/editor-pane";
import { SearchPanel } from "@/components/search-panel";
import { findTextMatches, replaceTextRange, type TextSearchMatch } from "@/lib/text-search";
import { OutlinePanel } from "@/components/outline-panel";
import { SlideOverviewPanel } from "@/components/slide-overview-panel";
import { parseMarkdownOutline } from "@/lib/outline";
import { countMarpSlides, getLineForSlideIndex, getSlideIndexForLine } from "@/lib/slide-count";
import { computeMinimalSplice, moveSlide } from "@/lib/slide-blocks";
import { isEditableDeckFile, isMarkdownDeckFile } from "@/lib/file-types";
import { PaneResizeHandle } from "@/components/pane-resize-handle";
import { listThemeNames, rewriteCssUrls, setProjectThemes } from "@/lib/marp";
import { useAssetToken } from "@/lib/asset-token";
import { applyThemeToYText, getMarkdownTheme } from "@/lib/markdown-theme";
import { upsertProjectTheme, type ProjectTheme } from "@/lib/project-themes";
import { API_URL } from "@/lib/config";
import { releaseWakeLock, requestWakeLock } from "@/lib/wake-lock";
import { useProjectFilesWorkspace } from "@/features/project-files/use-project-files-workspace";
import { getParentFolderPath } from "@/features/project-files/file-tree";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MonitorOffIcon,
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

type PresentationSearch = {
	mode?: "present" | "viewer";
	file?: string;
	fullscreen?: boolean;
	slide?: number;
};

type PresentationAwarenessState = {
	fileId: string;
	slideIndex: number;
	blanked: boolean;
	updatedAt: number;
	userId: string;
	zoom: number;
	zoomOriginX: number;
	zoomOriginY: number;
	laserActive: boolean;
	laserXPercent: number;
	laserYPercent: number;
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
		typeof payload.userId !== "string" ||
		typeof payload.zoom !== "number" ||
		!Number.isFinite(payload.zoom) ||
		typeof payload.zoomOriginX !== "number" ||
		!Number.isFinite(payload.zoomOriginX) ||
		typeof payload.zoomOriginY !== "number" ||
		!Number.isFinite(payload.zoomOriginY) ||
		typeof payload.laserActive !== "boolean" ||
		typeof payload.laserXPercent !== "number" ||
		!Number.isFinite(payload.laserXPercent) ||
		typeof payload.laserYPercent !== "number" ||
		!Number.isFinite(payload.laserYPercent)
	) {
		return null;
	}

	return {
		fileId: payload.fileId,
		slideIndex: Math.max(0, Math.trunc(payload.slideIndex)),
		// Older clients don't send this field; treat it as "not blanked".
		blanked: payload.blanked === true,
		updatedAt: payload.updatedAt,
		userId: payload.userId,
		zoom: payload.zoom,
		zoomOriginX: payload.zoomOriginX,
		zoomOriginY: payload.zoomOriginY,
		laserActive: payload.laserActive,
		laserXPercent: payload.laserXPercent,
		laserYPercent: payload.laserYPercent,
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
	params: {
		parse: throw404OnError((data) => paramsValidator.parse(data)),
	},
	validateSearch: (search): PresentationSearch => {
		const slide = normalizeSearchSlide((search as { slide?: unknown }).slide);

		return {
			...searchValidator.parse(search),
			...(slide === null ? {} : { slide }),
		};
	},
	loader: ({ params }) => getProject(params.id),
	head: ({ loaderData }) => ({
		meta: loaderData ? [{ title: `${loaderData.project.name} - MarpCollab` }] : undefined,
	}),
	component: RouteComponent,
});

const SIDEBAR_DEFAULT_WIDTH = 304;
const SIDEBAR_COLLAPSED_WIDTH = 48;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 560;
const PREVIEW_MIN_WIDTH = 320;
const EDITOR_MIN_WIDTH = 320;

const SIDEBAR_WIDTH_STORAGE_KEY = "marp-collab:sidebar-width";
const PREVIEW_WIDTH_STORAGE_KEY = "marp-collab:preview-width";

function readStoredPaneWidth(key: string) {
	const raw = localStorage.getItem(key);
	const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : null;
}

function clampPaneWidth(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), Math.max(min, max));
}

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
	const { project } = Route.useLoaderData();
	const [selectedFile, setSelectedFile] = useState<DeckFile | null>(null);

	const projectPresenceAwareness = useProjectPresence(
		id,
		session?.user ?? null,
		presenceUser,
		selectedFile?.id ?? null,
	);
	const projectFiles = useProjectFilesWorkspace({
		projectId: id,
		selectedFile,
		onSelectFile: setSelectedFile,
		presenceAwareness: projectPresenceAwareness,
		currentUserId: presenceUser.userId,
	});
	const { files, isLoading, uploadFiles } = projectFiles;
	const collab = useCollabDocument(
		selectedFile?.type === "markdown" ? (selectedFile.documentName ?? null) : null,
		session?.user ?? null,
		presenceUser,
		(payload) => {
			if (payload === "files-changed") {
				void projectFiles.reload();
			}
		},
	);
	const [previewFile, setPreviewFile] = useState<DeckFile | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(
		() => readStoredPaneWidth(SIDEBAR_WIDTH_STORAGE_KEY) ?? SIDEBAR_DEFAULT_WIDTH,
	);
	const [previewWidth, setPreviewWidth] = useState<number | null>(() =>
		readStoredPaneWidth(PREVIEW_WIDTH_STORAGE_KEY),
	);
	const [sidebarResizing, setSidebarResizing] = useState(false);
	const mainRef = useRef<HTMLElement | null>(null);
	const [markdown, setMarkdown] = useState("");
	const [projectThemes, setProjectThemesState] = useState<ProjectTheme[]>([]);
	const [themeNames, setThemeNames] = useState<string[]>(() => listThemeNames());
	const [themeRevision, setThemeRevision] = useState(0);
	const [assetRevision, setAssetRevision] = useState(0);
	const assetToken = useAssetToken(id);
	const [slideIndex, setSlideIndex] = useState(0);
	const [isBlanked, setIsBlanked] = useState(false);
	const [zoomState, setZoomState] = useState({ zoom: 1, originX: 50, originY: 50 });
	const [laserState, setLaserState] = useState({ active: false, xPercent: -1, yPercent: -1 });
	const [cursorLine, setCursorLine] = useState(1);
	const [startedAt, setStartedAt] = useState(() => Date.now());
	const [now, setNow] = useState(() => Date.now());
	const [isTimerPaused, setIsTimerPaused] = useState(false);
	const [pausedElapsedMs, setPausedElapsedMs] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [pendingCursorJump, setPendingCursorJump] = useState<{
		userId: string;
		userName: string;
	} | null>(null);
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

	useEffect(() => {
		localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
	}, [sidebarWidth]);

	useEffect(() => {
		if (previewWidth === null) {
			localStorage.removeItem(PREVIEW_WIDTH_STORAGE_KEY);
		} else {
			localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(previewWidth));
		}
	}, [previewWidth]);

	const resizeSidebar = useCallback((clientX: number) => {
		const rect = mainRef.current?.getBoundingClientRect();
		if (!rect) {
			return;
		}

		setSidebarWidth(
			clampPaneWidth(
				Math.round(clientX - rect.left),
				SIDEBAR_MIN_WIDTH,
				Math.min(SIDEBAR_MAX_WIDTH, rect.width * 0.4),
			),
		);
	}, []);

	const nudgeSidebar = useCallback((delta: number) => {
		setSidebarWidth((width) => clampPaneWidth(width + delta, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
	}, []);

	const resizePreview = useCallback(
		(clientX: number) => {
			const rect = mainRef.current?.getBoundingClientRect();
			if (!rect) {
				return;
			}

			const sidebarColumn = sidebarOpen ? sidebarWidth : SIDEBAR_COLLAPSED_WIDTH;
			setPreviewWidth(
				clampPaneWidth(
					Math.round(rect.right - clientX),
					PREVIEW_MIN_WIDTH,
					rect.width - sidebarColumn - EDITOR_MIN_WIDTH,
				),
			);
		},
		[sidebarOpen, sidebarWidth],
	);

	const resetPaneLayout = useCallback(() => {
		setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
		setPreviewWidth(null);
	}, []);

	const nudgePreview = useCallback((delta: number) => {
		const rect = mainRef.current?.getBoundingClientRect();
		setPreviewWidth((width) => {
			// The default track is minmax(320px, 42%); resolve it to pixels so
			// the first keyboard nudge starts from the rendered width.
			const current = width ?? Math.max(PREVIEW_MIN_WIDTH, Math.round((rect?.width ?? 0) * 0.42));
			// Moving the divider right shrinks the preview pane.
			return clampPaneWidth(
				current - delta,
				PREVIEW_MIN_WIDTH,
				rect ? rect.width - SIDEBAR_MIN_WIDTH - EDITOR_MIN_WIDTH : current,
			);
		});
	}, []);

	const uploadDroppedImages = useCallback(
		async (imageFiles: File[]): Promise<MarkdownImageUploadResult> => {
			if (!selectedFile || !isMarkdownDeckFile(selectedFile)) {
				return { images: [], failures: ["Images can only be inserted into a Markdown file."] };
			}

			const destination = getParentFolderPath(selectedFile.id);
			const { uploadedFiles, failures } = await uploadFiles(
				imageFiles,
				destination || undefined,
			);
			const images = uploadedFiles.map((file) => {
				const relativePath =
					destination && file.id.startsWith(`${destination}/`)
						? file.id.slice(destination.length + 1)
						: file.id;
				const fileName = relativePath.split("/").at(-1) ?? relativePath;

				return {
					alt: fileName.replace(/\.[^.]+$/, ""),
					path: relativePath,
				};
			});

			return { images, failures };
		},
		[uploadFiles, selectedFile],
	);

	const isPresentation = search.mode === "present" || search.mode === "viewer";
	const isViewer = search.mode === "viewer";
	const autoFullscreen = search.fullscreen === true;
	const outlineItems = useMemo(() => parseMarkdownOutline(markdown), [markdown]);
	const slideCount = useMemo(() => countMarpSlides(markdown), [markdown]);
	// Only follow the cursor when the editor is actively editing the file
	// being previewed — editing a CSS theme shouldn't move the preview scroll.
	const isEditingPreviewFile =
		isMarkdownDeckFile(selectedFile) && selectedFile.id === previewFile?.id;
	const followSlideIndex = isEditingPreviewFile ? getSlideIndexForLine(markdown, cursorLine) : null;

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

	useEffect(() => {
		// Project files are served under stable URLs; bump the asset version when
		// the file list changes so re-uploaded images bypass the browser cache.
		setAssetRevision((revision) => revision + 1);
	}, [files]);

	useEffect(() => {
		if (!selectedFile) {
			setMarkdown("");
			return;
		}

		if (selectedFile.id.endsWith(".css")) {
			return;
		}

		// The collab state lags one render behind a file switch, so yText can
		// still hold the previously opened document. Only sync once the selected
		// file's own document has loaded; until then keep the previous markdown
		// so the preview doesn't re-render and lose its scroll position.
		if (
			!collab.yText ||
			!collab.synced ||
			collab.documentName !== (selectedFile.documentName ?? null)
		) {
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
	}, [collab.documentName, collab.synced, collab.yText, selectedFile]);

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
						return {
							id: file.id,
							css: rewriteCssUrls(await res.text(), id, file.id, assetToken),
						};
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
	}, [files, id, assetToken]);

	useEffect(() => {
		setThemeNames(setProjectThemes(projectThemes));
		setThemeRevision((revision) => revision + 1);
	}, [projectThemes]);

	useEffect(() => {
		if (
			!selectedFile?.id.toLowerCase().endsWith(".css") ||
			!collab.yText ||
			collab.documentName !== (selectedFile.documentName ?? null)
		) {
			return;
		}

		const syncTheme = () => {
			// oxlint-disable-next-line no-base-to-string
			const css = rewriteCssUrls(collab.yText?.toString() ?? "", id, selectedFile.id, assetToken);
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
	}, [collab.documentName, collab.yText, id, selectedFile, assetToken]);

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

	const jumpToUserCursor = useCallback(
		(userId: string) => {
			const doc = collab.yText?.doc;
			if (!collab.awareness || !collab.yText || !doc) {
				return false;
			}

			for (const state of collab.awareness.getStates().values()) {
				const user = (state as { user?: { id?: string } }).user;
				if (user?.id !== userId) {
					continue;
				}

				const cursor = (state as { cursor?: { head?: unknown } }).cursor;
				if (!cursor?.head) {
					continue;
				}

				try {
					const head = Y.createAbsolutePositionFromRelativePosition(
						Y.createRelativePositionFromJSON(cursor.head),
						doc,
					);
					if (!head || head.type !== collab.yText) {
						continue;
					}

					editorPaneRef.current?.jumpToOffset(head.index);
					return true;
				} catch {
					continue;
				}
			}

			return false;
		},
		[collab.awareness, collab.yText],
	);

	const handleParticipantClick = useCallback(
		(participantId: string) => {
			if (!participantId || participantId === presenceUser.userId) {
				return;
			}

			let participantName = "This user";
			let targetFileId: string | null = null;
			for (const state of projectPresenceAwareness?.getStates().values() ?? []) {
				const user = (state as { user?: { id?: string; name?: string } }).user;
				if (user?.id !== participantId) {
					continue;
				}

				participantName = user.name ?? participantName;
				const activeFile = (state as { activeFile?: { fileId?: unknown } | null }).activeFile;
				if (typeof activeFile?.fileId === "string") {
					targetFileId = activeFile.fileId;
					break;
				}
			}

			if (targetFileId && targetFileId !== selectedFile?.id) {
				const targetFile = files.find((file) => file.id === targetFileId);
				if (targetFile && isEditableDeckFile(targetFile)) {
					setSelectedFile(targetFile);
					setPendingCursorJump({ userId: participantId, userName: participantName });
					return;
				}
			}

			if (!jumpToUserCursor(participantId)) {
				// The cursor may not have been broadcast yet; keep retrying briefly.
				setPendingCursorJump({ userId: participantId, userName: participantName });
			}
		},
		[files, jumpToUserCursor, presenceUser.userId, projectPresenceAwareness, selectedFile?.id],
	);

	useEffect(() => {
		if (!pendingCursorJump || !collab.awareness || !collab.synced) {
			return;
		}

		if (jumpToUserCursor(pendingCursorJump.userId)) {
			setPendingCursorJump(null);
			return;
		}

		const awareness = collab.awareness;
		const retry = () => {
			if (jumpToUserCursor(pendingCursorJump.userId)) {
				setPendingCursorJump(null);
			}
		};
		awareness.on("change", retry);
		const timeout = window.setTimeout(() => {
			setPendingCursorJump(null);
			toast(`${pendingCursorJump.userName} has no cursor in this file right now.`);
		}, 4000);

		return () => {
			awareness.off("change", retry);
			window.clearTimeout(timeout);
		};
	}, [collab.awareness, collab.synced, jumpToUserCursor, pendingCursorJump]);

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

	// Reordering rewrites the deck's own document, so it is only offered while
	// that deck is the file the editor has open for writing.
	const canReorderSlides = isEditingPreviewFile && !collab.readOnly;
	const reorderHint = collab.readOnly
		? "You have read-only access to this deck."
		: canReorderSlides
			? "Click to jump, drag to reorder."
			: "Open this deck in the editor to reorder its slides.";

	const handleMoveSlide = useCallback(
		(from: number, to: number) => {
			const yText = collab.yText;
			if (!yText || !canReorderSlides) {
				return;
			}

			// oxlint-disable-next-line no-base-to-string
			const current = yText.toString();
			const next = moveSlide(current, from, to);
			const splice = computeMinimalSplice(current, next);
			if (!splice) {
				return;
			}

			const applyMove = () => {
				yText.delete(splice.index, splice.deleteCount);
				if (splice.insert) {
					yText.insert(splice.index, splice.insert);
				}
			};

			if (yText.doc) {
				yText.doc.transact(applyMove);
			} else {
				applyMove();
			}

			// Follow the slide to its new home so the caret doesn't strand the
			// preview on whatever content shifted into the old position.
			editorPaneRef.current?.jumpToLine(getLineForSlideIndex(next, to));
		},
		[canReorderSlides, collab.yText],
	);

	useEffect(() => {
		if (!isPresentation) {
			return;
		}

		const currentTime = Date.now();
		setStartedAt(currentTime);
		setNow(currentTime);
		setIsTimerPaused(false);
		setPausedElapsedMs(0);
		setIsBlanked(false);
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

			setIsBlanked((current) => {
				if (current !== newestState.blanked) {
					suppressNextSlideAwarenessUpdateRef.current = true;
				}
				return newestState.blanked;
			});

			setZoomState((current) => {
				if (
					current.zoom === newestState.zoom &&
					current.originX === newestState.zoomOriginX &&
					current.originY === newestState.zoomOriginY
				) {
					return current;
				}
				suppressNextSlideAwarenessUpdateRef.current = true;
				return {
					zoom: newestState.zoom,
					originX: newestState.zoomOriginX,
					originY: newestState.zoomOriginY,
				};
			});

			setLaserState((current) => {
				if (
					current.active === newestState.laserActive &&
					current.xPercent === newestState.laserXPercent &&
					current.yPercent === newestState.laserYPercent
				) {
					return current;
				}
				suppressNextSlideAwarenessUpdateRef.current = true;
				return {
					active: newestState.laserActive,
					xPercent: newestState.laserXPercent,
					yPercent: newestState.laserYPercent,
				};
			});

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
			blanked: isBlanked,
			updatedAt,
			userId: presenceUser.userId,
			zoom: zoomState.zoom,
			zoomOriginX: zoomState.originX,
			zoomOriginY: zoomState.originY,
			laserActive: laserState.active,
			laserXPercent: laserState.xPercent,
			laserYPercent: laserState.yPercent,
		} satisfies PresentationAwarenessState);
	}, [
		collab.awareness,
		isBlanked,
		isPresentation,
		laserState,
		presenceUser.userId,
		selectedFile?.id,
		selectedFile?.type,
		zoomState,
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
				// PowerPoint-style "black screen": blanks the audience screen
				// (viewer windows) while the presenter view stays visible.
				hotkey: "B",
				callback: () => setIsBlanked((current) => !current),
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
		{ enabled: isPresentation, conflictBehavior: "allow" },
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
				projectId={id}
				selectedFileId={selectedFile?.id ?? null}
				themeRevision={themeRevision}
				assetRevision={assetRevision}
				assetToken={assetToken}
				onMetaChange={({ active }) => {
					setSlideIndex(active);
				}}
				zoomState={zoomState}
				onZoomChange={setZoomState}
				laserState={laserState}
				onLaserChange={setLaserState}
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
					{isBlanked && (
						<div className="absolute inset-0 z-40 flex select-none flex-col items-center justify-center gap-3 bg-black">
							<PauseIcon aria-hidden className="size-10 text-white/70" />
							<p className="text-sm text-white/70">Presentation paused</p>
						</div>
					)}
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
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant={isBlanked ? "default" : "secondary"}
										size="icon"
										className="md:h-7 md:w-auto md:gap-1 md:px-2 md:text-xs/relaxed"
										aria-label={isBlanked ? "Resume audience screen" : "Blank audience screen"}
										onClick={() => setIsBlanked((current) => !current)}
									>
										<MonitorOffIcon />
										<span className="hidden md:inline">
											{isBlanked ? "Resume screen" : "Blank screen"}
										</span>
									</Button>
								}
							/>
							<TooltipContent>
								{isBlanked ? "Resume audience screen (B)" : "Blank audience screen (B)"}
							</TooltipContent>
						</Tooltip>
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

				<div className="relative min-h-0">
					{frame}
					{isBlanked && (
						<div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
							<span className="rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white shadow-lg">
								Audience screen is blanked — press B to resume
							</span>
						</div>
					)}
				</div>

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
						<PresenceAvatars
							awareness={projectPresenceAwareness}
							onParticipantClick={handleParticipantClick}
						/>
						<ManageProjectCollaborator projectId={id} />
						<PresentationActions
							projectId={id}
							selectedFileId={previewFile?.id ?? null}
							fileLabel={previewFile?.label ?? null}
						/>
					</>
				}
			/>
			<main
				ref={mainRef}
				className={cn(
					"grid min-h-0 flex-1 grid-cols-1 overflow-hidden max-md:grid-rows-[auto_minmax(0,3fr)_minmax(0,2fr)]",
					"xl:grid-cols-[var(--sidebar-col)_0px_minmax(0,1fr)_0px_var(--preview-col)]",
				)}
				style={
					{
						"--sidebar-col": sidebarOpen
							? `min(${sidebarWidth}px, 40vw)`
							: `${SIDEBAR_COLLAPSED_WIDTH}px`,
						"--preview-col":
							previewWidth === null
								? `minmax(${PREVIEW_MIN_WIDTH}px, 42%)`
								: `min(${previewWidth}px, 60%)`,
					} as React.CSSProperties
				}
			>
				<FileSidebar
					workspace={projectFiles}
					sidebarOpen={sidebarOpen}
					setSidebarOpen={setSidebarOpen}
					width={sidebarWidth}
					isResizing={sidebarResizing}
					onResetPaneLayout={resetPaneLayout}
					themeNames={themeNames}
					currentTheme={currentTheme}
					onThemeChange={handleThemeChange}
					themeSelectDisabled={!isMarkdownDeckFile(selectedFile) || collab.readOnly}
					onProjectDeleted={() => {
						void navigate({ to: "/", replace: true });
					}}
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
					slidesPanel={
						<SlideOverviewPanel
							markdown={markdown}
							isMarkdown={previewFile !== null}
							projectId={id}
							deckFileId={previewFile?.id ?? null}
							themeRevision={themeRevision}
							assetRevision={assetRevision}
							assetToken={assetToken}
							activeSlideIndex={followSlideIndex}
							canReorder={canReorderSlides}
							reorderHint={reorderHint}
							onSelectSlide={(index) =>
								editorPaneRef.current?.jumpToLine(getLineForSlideIndex(markdown, index))
							}
							onMoveSlide={handleMoveSlide}
						/>
					}
				/>

				<PaneResizeHandle
					label="Resize sidebar"
					onResize={resizeSidebar}
					onNudge={nudgeSidebar}
					onReset={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
					onResizingChange={setSidebarResizing}
					disabled={!sidebarOpen}
				/>

				<Suspense>
					<EditorPane
						ref={editorPaneRef}
						label={selectedFile?.label ?? null}
						yText={collab.yText}
						awareness={collab.awareness}
						undoManager={collab.undoManager}
						readOnly={collab.readOnly}
						onUploadImages={uploadDroppedImages}
						onCursorLineChange={setCursorLine}
					/>
				</Suspense>

				<PaneResizeHandle
					label="Resize preview"
					onResize={resizePreview}
					onNudge={nudgePreview}
					onReset={() => setPreviewWidth(null)}
				/>

				<Suspense>
					<PreviewPane
						markdown={markdown}
						label={previewFile?.label ?? null}
						projectId={id}
						themeRevision={themeRevision}
						assetRevision={assetRevision}
						assetToken={assetToken}
						selectedFileId={previewFile?.id ?? null}
						followSlideIndex={followSlideIndex}
						onSlideDoubleClick={(index) => {
							if (!isEditingPreviewFile) {
								return;
							}

							editorPaneRef.current?.jumpToLine(getLineForSlideIndex(markdown, index));
						}}
					/>
				</Suspense>
			</main>
		</div>
	);
}
