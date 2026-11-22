import { throw404OnError, cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4-mini";
import * as Y from "yjs";
import { toast } from "sonner";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { FileSidebar } from "@/components/file-sidebar";
import { ProjectGitControls } from "@/components/project-git-setting";
import {
	useCollabDocument,
	usePresenceUser,
	useProjectPresence,
} from "@/hooks/use-collab-document";
import { hasMarkdownIncludes } from "@/lib/markdown-include";
import { useIncludedMarkdown } from "@/hooks/use-included-markdown";
import type { DeckFile, ProjectCollaboratorsResponse } from "@/lib/types";
import Navbar from "@/components/navbar";
import { PresenceAvatars } from "@/components/presence-avatars";
import { PresentationActions } from "@/components/presentation-actions";
import { ManageProjectCollaborator } from "@/components/dialog/manage-project-collaborator";
import { getProject } from "@/lib/project";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { PresentationFrame } from "@/components/presentation-frame";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PresentationTimer } from "@/components/presentation-timer";
import { HelpDialog } from "@/components/dialog/help-dialog";
import type { EditorPaneHandle, MarkdownImageUploadResult } from "@/components/editor-pane";
import { SearchPanel } from "@/components/search-panel";
import { findTextMatches, replaceTextRange, type TextSearchMatch } from "@/lib/text-search";
import { OutlinePanel } from "@/components/outline-panel";
import { SlideOverviewPanel } from "@/components/slide-overview-panel";
import { parseMarkdownOutline } from "@/lib/outline";
import { countMarpSlides, getLineForSlideIndex, getSlideIndexForLine } from "@/lib/slide-count";
import {
	getEditableSlideDeck,
	getSlideNavigationLines,
	type DeckBlocks,
	type SlideEdit,
} from "@/lib/slide-blocks";
import { isEditableDeckFile, isMarkdownDeckFile } from "@/lib/file-types";
import { PaneResizeHandle } from "@/components/pane-resize-handle";
import {
	analyzeSlides,
	listThemeNames,
	rewriteCssUrls,
	setProjectThemes,
	type SlideChecks,
} from "@/lib/marp";
import { useAssetToken } from "@/lib/asset-token";
import { inlineProjectThemeFonts } from "@/lib/project-theme-fonts";
import { fetcher } from "@/lib/fetcher";
import { applyThemeToYText, getMarkdownTheme } from "@/lib/markdown-theme";
import { upsertProjectTheme } from "@/lib/project-themes";
import { createProjectThemeStore } from "@/lib/project-theme-store";
import { API_URL } from "@/lib/config";
import { releaseWakeLock, requestWakeLock } from "@/lib/wake-lock";
import { openDemoWindow, supportsDemoWindow } from "@/lib/demo-window";
import {
	hasDemoAudience,
	publishDemoShare,
	registerDemoPresenter,
	stopDemoFromAudience,
	stopDemoStream,
	TOGGLE_AUDIENCE_FULLSCREEN,
	toggleAudienceFullscreen,
} from "@/lib/demo-share";
import { DemoAudienceVideo } from "@/components/demo-audience-video";
import { useProjectFilesWorkspace } from "@/features/project-files/use-project-files-workspace";
import {
	getImageUploadDestination,
	getMarkdownRelativeFilePath,
} from "@/features/project-files/image-upload-paths";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	LaptopIcon,
	MaximizeIcon,
	MonitorOffIcon,
	MonitorPlayIcon,
	PauseIcon,
	XIcon,
} from "lucide-react";
import useSWR from "swr";

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
	blanked?: boolean;
	demo?: boolean;
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
		blanked: typeof payload.blanked === "boolean" ? payload.blanked : undefined,
		demo: typeof payload.demo === "boolean" ? payload.demo : undefined,
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

async function exitFullscreenQuietly() {
	try {
		await document.exitFullscreen();
	} catch {
		// Fullscreen already ended in the meantime, e.g. via Esc.
	}
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

function resolveSelectedFile(
	files: DeckFile[],
	isLoading: boolean,
	requestedFileId: string | undefined,
	selectedFile: DeckFile | null,
): DeckFile | null {
	if (files.length === 0) {
		return null;
	}

	if (selectedFile && (isLoading || files.some((file) => file.id === selectedFile.id))) {
		return selectedFile;
	}

	const requestedFile = requestedFileId
		? files.find((file) => file.id === requestedFileId && isMarkdownDeckFile(file))
		: null;

	return (
		requestedFile ??
		files.find((file) => file.id === "presentation.md") ??
		files.find((file) => isMarkdownDeckFile(file)) ??
		files[0] ??
		null
	);
}

function resolvePreviewFile(
	files: DeckFile[],
	selectedFile: DeckFile | null,
	previewFile: DeckFile | null,
): DeckFile | null {
	if (isMarkdownDeckFile(selectedFile)) {
		return selectedFile;
	}

	if (previewFile && files.some((file) => file.id === previewFile.id && isMarkdownDeckFile(file))) {
		return previewFile;
	}

	return files.find((file) => isMarkdownDeckFile(file)) ?? null;
}

function RouteComponent() {
	const { session } = Route.useRouteContext();

	const { id } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const presenceUser = usePresenceUser(session?.user ?? null);
	const { project, readOnly } = Route.useLoaderData();
	const [selectedFile, setSelectedFile] = useState<DeckFile | null>(null);
	const [filesChangedRevision, setFilesChangedRevision] = useState(0);
	const [collabRevision, setCollabRevision] = useState(0);

	const projectPresenceAwareness = useProjectPresence(
		id,
		session?.user ?? null,
		presenceUser,
		selectedFile?.id ?? null,
		(payload) => {
			if (payload === "files-changed") {
				setFilesChangedRevision((revision) => revision + 1);
			}
			if (payload === "git-sync-finished") {
				setCollabRevision((revision) => revision + 1);
			}
		},
	);
	const projectFiles = useProjectFilesWorkspace({
		projectId: id,
		selectedFile,
		onSelectFile: setSelectedFile,
		presenceAwareness: projectPresenceAwareness,
		currentUserId: presenceUser.userId,
	});
	const { files, isLoading, presenceByFileId, reload, uploadFiles } = projectFiles;
	useEffect(() => {
		if (filesChangedRevision > 0) {
			void reload();
		}
	}, [filesChangedRevision, reload]);
	const projectFileIds = useMemo(
		() => files.filter((file) => file.type !== "folder").map((file) => file.id),
		[files],
	);
	const { data: collaboratorsData } = useSWR<ProjectCollaboratorsResponse>(
		`${API_URL}/projects/${id}/collaborators`,
		fetcher,
	);
	const projectOwner = collaboratorsData?.owner;
	const storedCollaborators = collaboratorsData?.collaborators;
	const presenterUsers = useMemo(() => {
		const otherUsers = selectedFile ? (presenceByFileId.get(selectedFile.id) ?? []) : [];

		return [
			{ name: presenceUser.userName, image: presenceUser.image },
			...otherUsers.map((user) => ({ name: user.name, image: user.image })),
			...(projectOwner ? [{ name: projectOwner.userName, image: projectOwner.userImage }] : []),
			...(storedCollaborators ?? []).map((user) => ({
				name: user.userName,
				image: user.userImage,
			})),
		];
	}, [
		presenceByFileId,
		presenceUser.image,
		presenceUser.userName,
		projectOwner,
		selectedFile,
		storedCollaborators,
	]);
	const collab = useCollabDocument(
		selectedFile?.type === "markdown" ? (selectedFile.documentName ?? null) : null,
		session?.user ?? null,
		presenceUser,
		collabRevision,
	);
	const wasGitSyncingRef = useRef(false);
	useEffect(() => {
		if (collab.status === "syncing") {
			if (!wasGitSyncingRef.current) {
				wasGitSyncingRef.current = true;
				toast.info("This project is syncing with Git. Reconnecting once it's done…");
			}
			return;
		}
		if (wasGitSyncingRef.current && collab.status === "connected") {
			wasGitSyncingRef.current = false;
			toast.success("Git sync finished. You're reconnected.");
		}
	}, [collab.status]);
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
	const [projectThemeStore] = useState(() =>
		createProjectThemeStore(setProjectThemes, listThemeNames()),
	);
	const {
		themes: projectThemes,
		names: themeNames,
		revision: themeRevision,
	} = useSyncExternalStore(projectThemeStore.subscribe, projectThemeStore.getSnapshot);
	const [assetRevision, setAssetRevision] = useState(0);
	const assetToken = useAssetToken(id);
	const [slideIndex, setSlideIndex] = useState(0);
	const [isBlanked, setIsBlanked] = useState(false);
	const hasChangedBlankingRef = useRef(false);
	const lastBlankingUpdateRef = useRef(0);
	const [isDemo, setIsDemo] = useState(false);
	const hasChangedDemoRef = useRef(false);
	const lastDemoUpdateRef = useRef(0);
	const [isSharingDemo, setIsSharingDemo] = useState(false);
	// React dev tooling inspects props. Passing the PiP window would expose cross-origin frames.
	const [demoContainer, setDemoContainer] = useState<HTMLElement | null>(null);
	const demoWindowRef = useRef<Window | null>(null);
	const stopDemoShareRef = useRef<(() => void) | null>(null);
	const demoCapturePendingRef = useRef(false);
	// A pending picker or floating window may resolve after leaving the deck.
	const demoRequestRef = useRef(0);
	const closeDemoOutput = useCallback(() => {
		demoRequestRef.current += 1;
		stopDemoShareRef.current?.();
		stopDemoShareRef.current = null;
		const current = demoWindowRef.current;
		demoWindowRef.current = null;
		current?.close();
	}, []);
	const stopDemo = useCallback(() => {
		closeDemoOutput();
		setIsDemo(false);
	}, [closeDemoOutput]);
	const slideHasSpeakerNotesRef = useRef(false);
	const handleHasSpeakerNotesChange = useCallback((hasSpeakerNotes: boolean) => {
		slideHasSpeakerNotesRef.current = hasSpeakerNotes;
	}, []);
	const [zoomState, setZoomState] = useState({ zoom: 1, originX: 50, originY: 50 });
	const [laserState, setLaserState] = useState({ active: false, xPercent: -1, yPercent: -1 });
	const [cursorLine, setCursorLine] = useState(1);
	const [searchQuery, setSearchQuery] = useState("");
	const [pendingCursorJump, setPendingCursorJump] = useState<{
		userId: string;
		userName: string;
	} | null>(null);
	const [searchMatches, setSearchMatches] = useState<TextSearchMatch[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const editorPaneRef = useRef<EditorPaneHandle | null>(null);
	const presentationContainerRef = useRef<HTMLDivElement | null>(null);
	const selectedCssFileIdRef = useRef<string | null>(null);
	// Invalidate pending CSS edits each time the project theme list reloads.
	const themeLoadEpochRef = useRef(0);
	const suppressNextSlideAwarenessUpdateRef = useRef(false);
	const lastAppliedPresentationUpdateRef = useRef(0);
	const selectedCssFileId = selectedFile?.id.toLowerCase().endsWith(".css")
		? selectedFile.id
		: null;

	useEffect(() => {
		selectedCssFileIdRef.current = selectedCssFileId;
	}, [selectedCssFileId]);

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
			// Resolve the default grid width so the first keyboard nudge starts at the displayed width.
			const current = width ?? Math.max(PREVIEW_MIN_WIDTH, Math.round((rect?.width ?? 0) * 0.42));
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

			const destination = getImageUploadDestination(files, selectedFile.id);
			const { uploadedFiles, failures } = await uploadFiles(imageFiles, destination || undefined);
			const images = uploadedFiles.map((file) => {
				const relativePath = getMarkdownRelativeFilePath(selectedFile.id, file.id);
				const fileName = relativePath.split("/").at(-1) ?? relativePath;

				return {
					alt: fileName.replace(/\.[^.]+$/, ""),
					path: relativePath,
				};
			});

			return { images, failures };
		},
		[files, uploadFiles, selectedFile],
	);

	const isPresentation = search.mode === "present" || search.mode === "viewer";
	const isViewer = search.mode === "viewer";
	const autoFullscreen = search.fullscreen === true;
	const outlineItems = useMemo(() => parseMarkdownOutline(markdown), [markdown]);
	// Editing another file, such as the theme, must not move the preview.
	const isEditingPreviewFile =
		isMarkdownDeckFile(selectedFile) && selectedFile.id === previewFile?.id;

	// Render with includes expanded. The editor and its cursor keep the original source.
	const included = useIncludedMarkdown(markdown, id, previewFile?.id ?? null);
	const renderedMarkdown = included.markdown;
	const hasIncludes = hasMarkdownIncludes(markdown);
	const expandedLine = included.sourceLines.indexOf(cursorLine) + 1;
	const followSlideIndex = isEditingPreviewFile
		? getSlideIndexForLine(renderedMarkdown, expandedLine || cursorLine)
		: null;
	const sourceLineForSlide = (index: number) => {
		const line = getLineForSlideIndex(renderedMarkdown, index);
		return included.sourceLines[line - 1] ?? line;
	};
	const slideCount = useMemo(() => countMarpSlides(renderedMarkdown), [renderedMarkdown]);

	// Adjust state during render instead of in effects to avoid an extra commit.
	const nextSelectedFile = resolveSelectedFile(files, isLoading, search.file, selectedFile);
	if (nextSelectedFile !== selectedFile) {
		setSelectedFile(nextSelectedFile);
	}

	const nextPreviewFile = resolvePreviewFile(files, selectedFile, previewFile);
	if (nextPreviewFile !== previewFile) {
		setPreviewFile(nextPreviewFile);
	}

	// Project files are served under stable URLs; bump the asset version when
	// the file list changes so re-uploaded images bypass the browser cache.
	const [assetFiles, setAssetFiles] = useState(() => ({
		id,
		files,
		themeFontRequests: new Map<string, Promise<string | undefined>>(),
	}));
	if (assetFiles.id !== id || assetFiles.files !== files) {
		setAssetFiles({ id, files, themeFontRequests: new Map() });
		setAssetRevision((revision) => revision + 1);
	}
	const { themeFontRequests } = assetFiles;

	if (!selectedFile && markdown !== "") {
		setMarkdown("");
	}

	const syncedYText =
		collab.yText && collab.synced && collab.documentName === (selectedFile?.documentName ?? null)
			? collab.yText
			: null;

	useEffect(() => {
		// Keep rendering the last deck while the new document syncs to preserve preview scroll.
		if (!selectedFile || selectedFile.id.endsWith(".css") || !syncedYText) {
			return;
		}

		const sync = () => {
			// oxlint-disable-next-line no-base-to-string
			setMarkdown(syncedYText.toString());
		};

		let frame: number;
		const scheduleSync = () => {
			cancelAnimationFrame(frame);
			// Publish after the Yjs transaction so typing cannot nest React updates.
			frame = requestAnimationFrame(sync);
		};
		sync();
		syncedYText.observe(scheduleSync);

		return () => {
			cancelAnimationFrame(frame);
			syncedYText.unobserve(scheduleSync);
		};
	}, [syncedYText, selectedFile]);

	useEffect(() => {
		const cssFiles = files.filter((file) => file.id.toLowerCase().endsWith(".css"));
		const controller = new AbortController();
		themeLoadEpochRef.current += 1;
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
							css: await inlineProjectThemeFonts(
								rewriteCssUrls(await res.text(), id, file.id, assetToken),
								id,
								themeFontRequests,
							),
						};
					} catch {
						return null;
					}
				}),
			);

			if (controller.signal.aborted) {
				return;
			}

			projectThemeStore.update((current) => {
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
	}, [files, id, assetToken, projectThemeStore, themeFontRequests]);

	useEffect(() => {
		// Unsynced text could replace a loaded theme with empty CSS.
		if (!selectedFile?.id.toLowerCase().endsWith(".css") || !syncedYText) {
			return;
		}

		let generation = 0;
		const applyTheme = async () => {
			const applied = ++generation;
			const epoch = themeLoadEpochRef.current;
			// oxlint-disable-next-line no-base-to-string
			const css = rewriteCssUrls(syncedYText.toString(), id, selectedFile.id, assetToken);
			// Embed fonts before registering the theme to avoid a flash of fallback fonts.
			const embeddedCss = await inlineProjectThemeFonts(css, id, themeFontRequests);
			if (applied !== generation || epoch !== themeLoadEpochRef.current) {
				return;
			}
			projectThemeStore.update((current) =>
				upsertProjectTheme(current, { id: selectedFile.id, css: embeddedCss }),
			);
		};

		let timer: ReturnType<typeof setTimeout> | undefined;
		const syncTheme = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				void applyTheme();
			}, 150);
		};

		syncedYText.observe(syncTheme);
		syncTheme();

		return () => {
			syncedYText.unobserve(syncTheme);
			// Flush a pending update so switching files doesn't drop the last edits.
			if (timer !== undefined) {
				clearTimeout(timer);
				void applyTheme();
			}
		};
	}, [syncedYText, id, selectedFile, assetToken, projectThemeStore, themeFontRequests]);

	const currentTheme = useMemo(() => getMarkdownTheme(markdown) ?? "default", [markdown]);

	const handleThemeChange = useCallback(
		(theme: string) => {
			if (collab.yText) {
				applyThemeToYText(collab.yText, theme);
			}
		},
		[collab.yText],
	);

	const [searchFileId, setSearchFileId] = useState(selectedFile?.id);
	if (searchFileId !== selectedFile?.id) {
		setSearchFileId(selectedFile?.id);
		setSearchMatches([]);
		setSearchError(null);
	}

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

		const awareness = collab.awareness;
		const retry = () => {
			if (jumpToUserCursor(pendingCursorJump.userId)) {
				setPendingCursorJump(null);
			}
		};
		retry();
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

	const canEditSlides =
		isEditingPreviewFile && syncedYText !== null && !collab.readOnly && !hasIncludes;
	const slideEditHint = hasIncludes
		? "Edit the source files to change slides in this deck with includes."
		: !isEditingPreviewFile
			? "Open this deck in the editor to change its slides."
			: collab.readOnly && syncedYText
				? "You have read-only access to this deck."
				: "Connect to the deck to change its slides.";

	function handleSlideEdit(
		source: string,
		fileId: string | null,
		edit: SlideEdit,
		before: SlideChecks,
	): DeckBlocks | null {
		const yText = syncedYText;
		if (!canEditSlides || !yText?.doc || fileId !== selectedFile?.id) {
			return null;
		}

		// Thumbnail indexes can be stale after a remote edit. Verify the source before applying them.
		// oxlint-disable-next-line no-base-to-string
		if (source !== yText.toString()) {
			toast("The deck changed. Try the slide action again.");
			return null;
		}
		if (source === edit.markdown) {
			return null;
		}

		let line: number;
		let next: DeckBlocks | null;
		try {
			const { slideSource, slideSettings, slideDirectives } = analyzeSlides(edit.markdown);
			if (slideSettings !== before.slideSettings) {
				toast.error("Move deck-wide directives to the front matter before making this slide edit.");
				return null;
			}
			// Check stationary slides for changes in directives inherited from the edited slide.
			if (
				edit.origins.some(
					(origin, index) =>
						origin !== null && slideDirectives[index] !== before.slideDirectives[origin],
				)
			) {
				toast.error(
					"This edit would restyle other slides through directives they inherit, like paginate or class. Edit the Markdown directly.",
				);
				return null;
			}
			next = getEditableSlideDeck(edit.markdown, slideSource);
			if (next?.blocks.length !== edit.slideCount) {
				toast.error("This edit would change the deck’s slide breaks. Edit the Markdown directly.");
				return null;
			}
			line = getSlideNavigationLines(edit.markdown, slideSource)[edit.index];
		} catch {
			toast.error("This edit could not be rendered. Edit the Markdown directly.");
			return null;
		}

		collab.undoManager?.stopCapturing();
		yText.doc.transact(() => {
			for (let i = edit.splices.length - 1; i >= 0; i -= 1) {
				const { index, deleteCount, insert } = edit.splices[i];
				if (deleteCount) {
					yText.delete(index, deleteCount);
				}
				if (insert) {
					yText.insert(index, insert);
				}
			}
		});
		collab.undoManager?.stopCapturing();

		setMarkdown(edit.markdown);
		editorPaneRef.current?.jumpToLine(line, false);
		return next;
	}

	const [wasPresentation, setWasPresentation] = useState(isPresentation);
	if (wasPresentation !== isPresentation) {
		setWasPresentation(isPresentation);
		if (isPresentation) {
			setIsBlanked(false);
			setIsDemo(false);
		}
	}

	const demoDeck = selectedFile?.type === "markdown" ? `${id}/${selectedFile.id}` : null;
	const presenterDemoDeck = isPresentation && !isViewer ? demoDeck : null;
	const toggleBlanked = useCallback(() => {
		hasChangedBlankingRef.current = true;
		setIsBlanked((current) => !current);
	}, []);
	const [previousDemoDeck, setPreviousDemoDeck] = useState(presenterDemoDeck);
	if (previousDemoDeck !== presenterDemoDeck) {
		setPreviousDemoDeck(presenterDemoDeck);
		setIsDemo(false);
	}
	if (!isDemo && isSharingDemo) {
		setIsSharingDemo(false);
	}
	if (!isDemo && demoContainer) {
		setDemoContainer(null);
	}

	useEffect(() => {
		if (!isDemo) {
			closeDemoOutput();
		}
	}, [isDemo, closeDemoOutput]);

	useEffect(() => {
		if (!isPresentation) {
			return;
		}

		const unregisterPresenter = presenterDemoDeck
			? registerDemoPresenter(presenterDemoDeck, () => {
					hasChangedDemoRef.current = true;
					stopDemo();
				})
			: undefined;
		if (!isViewer) {
			window.addEventListener("pagehide", stopDemo);
		}
		return () => {
			hasChangedBlankingRef.current = false;
			hasChangedDemoRef.current = false;
			lastBlankingUpdateRef.current = 0;
			lastDemoUpdateRef.current = 0;
			unregisterPresenter?.();
			window.removeEventListener("pagehide", stopDemo);
			closeDemoOutput();
		};
	}, [isPresentation, isViewer, demoDeck, presenterDemoDeck, closeDemoOutput, stopDemo]);

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

	const maxSlideIndex = Math.max(0, slideCount - 1);
	// Clamp only when the deck shrinks, so a slide received from the presenter
	// survives while included files are still loading.
	const [clampedForSlideCount, setClampedForSlideCount] = useState(slideCount);
	if (clampedForSlideCount !== slideCount) {
		setClampedForSlideCount(slideCount);
		if (slideIndex > maxSlideIndex) {
			setSlideIndex(maxSlideIndex);
		}
	}
	const [fullscreenPrompt, setFullscreenPrompt] = useState<"initial" | "requested" | null>(
		autoFullscreen ? "initial" : null,
	);

	const endDemo = useCallback(
		({ advance }: { advance: boolean }) => {
			hasChangedDemoRef.current = true;
			if (demoWindowRef.current) {
				window.focus();
			}
			stopDemo();
			if (advance) {
				setSlideIndex((current) => Math.min(current + 1, maxSlideIndex));
			}
		},
		[stopDemo, maxSlideIndex],
	);

	const startDemo = useCallback(async () => {
		if (demoCapturePendingRef.current) {
			return;
		}
		const request = ++demoRequestRef.current;
		if (
			presenterDemoDeck &&
			hasDemoAudience(presenterDemoDeck) &&
			navigator.mediaDevices?.getDisplayMedia
		) {
			demoCapturePendingRef.current = true;
			let stream: MediaStream;
			try {
				const options = {
					video: true,
					audio: false,
					selfBrowserSurface: "exclude",
					monitorTypeSurfaces: "exclude",
				} as const;
				stream = await navigator.mediaDevices.getDisplayMedia(options);
			} catch (error) {
				if (
					request === demoRequestRef.current &&
					!(error instanceof DOMException && error.name === "NotAllowedError")
				) {
					toast.error("Could not share the demo. Try choosing the tab or window again.");
				}
				return;
			} finally {
				demoCapturePendingRef.current = false;
			}

			if (request !== demoRequestRef.current) {
				stopDemoStream(stream);
				return;
			}
			const stop = publishDemoShare(presenterDemoDeck, stream, stopDemo);
			if (!stop) {
				toast.info("Demo sharing ended before it reached the audience window.");
				return;
			}
			stopDemoShareRef.current = stop;
			hasChangedDemoRef.current = true;
			setIsSharingDemo(true);
			setIsDemo(true);
			return;
		}

		hasChangedDemoRef.current = true;
		setIsDemo(true);
		const opened = await openDemoWindow({ compact: !slideHasSpeakerNotesRef.current });
		if (request !== demoRequestRef.current) {
			opened?.close();
			return;
		}
		if (!opened) {
			if (!supportsDemoWindow()) {
				toast.info("Floating demo controls need Chrome or Edge. Press L to end the demo.");
			}
			return;
		}

		demoWindowRef.current = opened;
		setDemoContainer(opened.document.body);
		// Closing the floating controls ends the live demo.
		opened.addEventListener(
			"pagehide",
			() => {
				if (demoWindowRef.current !== opened) {
					return;
				}
				demoWindowRef.current = null;
				setIsDemo(false);
			},
			{ once: true },
		);
	}, [presenterDemoDeck, stopDemo]);

	const toggleDemo = useCallback(() => {
		if (isDemo) {
			endDemo({ advance: false });
			return;
		}

		void startDemo();
	}, [isDemo, endDemo, startDemo]);

	const enterFullscreen = useCallback(async (fromPresenter = false) => {
		try {
			await (presentationContainerRef.current ?? document.documentElement).requestFullscreen();
			setFullscreenPrompt(null);
		} catch {
			if (fromPresenter) {
				setFullscreenPrompt("requested");
				return;
			}
			toast.error("Could not enter fullscreen. Try again in this window.");
		}
	}, []);

	const toggleLocalFullscreen = useCallback(
		(fromPresenter = false) => {
			if (document.fullscreenElement) {
				void exitFullscreenQuietly();
				return;
			}
			if (fromPresenter && fullscreenPrompt === "requested") {
				setFullscreenPrompt(null);
				return;
			}
			void enterFullscreen(fromPresenter);
		},
		[enterFullscreen, fullscreenPrompt],
	);

	const toggleFullscreen = useCallback(() => {
		if (presenterDemoDeck && toggleAudienceFullscreen(presenterDemoDeck)) {
			return;
		}
		toggleLocalFullscreen();
	}, [presenterDemoDeck, toggleLocalFullscreen]);

	useEffect(() => {
		if (!isViewer) {
			return;
		}
		const handleFullscreenRequest = (event: MessageEvent<unknown>) => {
			if (
				event.source !== null &&
				event.source === window.opener &&
				event.origin === window.location.origin &&
				event.data === TOGGLE_AUDIENCE_FULLSCREEN
			) {
				toggleLocalFullscreen(true);
			}
		};
		window.addEventListener("message", handleFullscreenRequest);
		return () => window.removeEventListener("message", handleFullscreenRequest);
	}, [isViewer, toggleLocalFullscreen]);

	useEffect(() => {
		if (!isPresentation || selectedFile?.type !== "markdown" || !collab.awareness) {
			return;
		}

		const applyNewestPresentationState = () => {
			let newestState: PresentationAwarenessState | null = null;
			let newestDemoState: PresentationAwarenessState | null = null;
			let newestBlankedState: PresentationAwarenessState | null = null;

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
				if (
					presentationState.demo !== undefined &&
					(!newestDemoState || presentationState.updatedAt > newestDemoState.updatedAt)
				) {
					newestDemoState = presentationState;
				}
				if (
					presentationState.blanked !== undefined &&
					(!newestBlankedState || presentationState.updatedAt > newestBlankedState.updatedAt)
				) {
					newestBlankedState = presentationState;
				}
			}

			if (newestDemoState || !hasChangedDemoRef.current) {
				const demoActive =
					newestDemoState?.demo === true && newestDemoState.updatedAt >= lastDemoUpdateRef.current;
				lastDemoUpdateRef.current = Math.max(
					lastDemoUpdateRef.current,
					newestDemoState?.updatedAt ?? 0,
				);
				setIsDemo((current) => {
					if (current !== demoActive) {
						suppressNextSlideAwarenessUpdateRef.current = true;
					}
					return demoActive;
				});
			}

			const blankingUpdatedAt = newestBlankedState?.updatedAt ?? 0;
			if (
				newestBlankedState
					? blankingUpdatedAt >= lastBlankingUpdateRef.current
					: !hasChangedBlankingRef.current
			) {
				const blanked = newestBlankedState?.blanked === true;
				lastBlankingUpdateRef.current = Math.max(lastBlankingUpdateRef.current, blankingUpdatedAt);
				setIsBlanked((current) => {
					if (current !== blanked) {
						suppressNextSlideAwarenessUpdateRef.current = true;
					}
					return blanked;
				});
			}

			if (!newestState || newestState.updatedAt < lastAppliedPresentationUpdateRef.current) {
				return;
			}

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
			// Only windows that have used a control publish its state.
			...(hasChangedBlankingRef.current ? { blanked: isBlanked } : {}),
			...(!isViewer && hasChangedDemoRef.current ? { demo: isDemo } : {}),
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
		isDemo,
		isPresentation,
		isViewer,
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
				callback: (event) => {
					if (!event.repeat) {
						toggleFullscreen();
					}
				},
			},
			{
				// Blank the audience display and keep the presenter view visible.
				hotkey: "B",
				callback: toggleBlanked,
			},
			{
				hotkey: "L",
				callback: (event) => {
					if (event.repeat) {
						return;
					}
					if (!isViewer) {
						toggleDemo();
						return;
					}
					if (demoDeck && isDemo) {
						stopDemoFromAudience(demoDeck);
					}
				},
				options: { enabled: !isViewer || isDemo },
			},
			{
				hotkey: "Escape",
				callback: () => {
					if (document.fullscreenElement) {
						void exitFullscreenQuietly();
						return;
					}
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
		const frame = (
			<PresentationFrame
				markdown={renderedMarkdown}
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
				presenterUsers={presenterUsers}
				showSpeakerNotes={!isViewer}
				demoActive={isDemo}
				demoContainer={isViewer ? null : demoContainer}
				onDemoStart={toggleDemo}
				onDemoEnd={endDemo}
				onToggleFullscreen={toggleFullscreen}
				onHasSpeakerNotesChange={handleHasSpeakerNotesChange}
				className="h-full w-full"
			/>
		);

		if (isViewer) {
			return (
				<div
					ref={presentationContainerRef}
					className="relative h-svh w-svw overflow-hidden bg-black text-white"
				>
					{frame}
					{isBlanked && (
						<div className="absolute inset-0 z-40 flex select-none flex-col items-center justify-center gap-3 bg-black">
							<PauseIcon aria-hidden className="size-10 text-white/70" />
							<p className="text-sm text-white/70">Presentation paused</p>
						</div>
					)}
					{demoDeck && <DemoAudienceVideo key={demoDeck} deck={demoDeck} blanked={isBlanked} />}
					{fullscreenPrompt && (
						<div
							className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/70"
							onClick={() => void enterFullscreen()}
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
			<div
				ref={presentationContainerRef}
				className="grid h-svh w-svw grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background"
			>
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
						<HelpDialog triggerClassName="max-md:hidden" />
						<PresentationTimer />
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
										onClick={toggleBlanked}
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
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant={isDemo ? "default" : "secondary"}
										size="icon"
										className="md:h-7 md:w-auto md:gap-1 md:px-2 md:text-xs/relaxed"
										aria-label={isDemo ? "End live demo" : "Start live demo"}
										onClick={toggleDemo}
									>
										<LaptopIcon />
										<span className="hidden md:inline">{isDemo ? "End demo" : "Live demo"}</span>
									</Button>
								}
							/>
							<TooltipContent>
								{isDemo ? "End live demo (L)" : "Start live demo (L)"}
							</TooltipContent>
						</Tooltip>
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="md:h-7 md:w-auto md:gap-1 md:px-2 md:text-xs/relaxed"
							aria-label="Open clean screen"
							onClick={() => window.open(viewerUrl, "_blank", "popup")}
						>
							<MonitorPlayIcon />
							<span className="hidden md:inline">Open clean screen</span>
						</Button>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="secondary"
										size="icon"
										aria-label="Toggle fullscreen"
										aria-keyshortcuts="F"
										onClick={toggleFullscreen}
									>
										<MaximizeIcon />
									</Button>
								}
							/>
							<TooltipContent>Toggle fullscreen (F)</TooltipContent>
						</Tooltip>
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
					{isBlanked ? (
						<div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
							<span className="rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white shadow-lg">
								Audience screen is blanked — press B to resume
							</span>
						</div>
					) : (
						isDemo && (
							<div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
								<span className="rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium text-white shadow-lg">
									{isSharingDemo
										? "Demo shared to the audience screen. Stop sharing or press L to return."
										: "Live demo running. Press L to return."}
								</span>
							</div>
						)
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
						<ProjectGitControls
							projectId={id}
							canWrite={!readOnly}
							onSynced={() => void projectFiles.reload()}
						/>
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
					"grid min-h-0 flex-1 grid-cols-1 overflow-hidden max-lg:grid-rows-[auto_minmax(0,3fr)_minmax(0,2fr)]",
					"lg:grid-cols-[var(--sidebar-col)_0px_minmax(0,1fr)_0px_var(--preview-col)]",
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
							markdown={renderedMarkdown}
							isMarkdown={previewFile !== null}
							projectId={id}
							deckFileId={previewFile?.id ?? null}
							themeRevision={themeRevision}
							assetRevision={assetRevision}
							assetToken={assetToken}
							activeLine={isEditingPreviewFile ? expandedLine || cursorLine : null}
							canEdit={canEditSlides}
							editHint={slideEditHint}
							onSelectLine={(line) => {
								if (isEditingPreviewFile) {
									editorPaneRef.current?.jumpToLine(included.sourceLines[line - 1] ?? line);
								}
							}}
							onEdit={handleSlideEdit}
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
						fileId={selectedFile?.id ?? null}
						projectFileIds={projectFileIds}
						files={files}
						themeNames={themeNames}
						projectThemes={projectThemes}
						yText={syncedYText}
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
						markdown={renderedMarkdown}
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

							editorPaneRef.current?.jumpToLine(sourceLineForSlide(index));
						}}
					/>
				</Suspense>
			</main>
		</div>
	);
}
