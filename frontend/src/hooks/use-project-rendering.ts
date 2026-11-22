import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Text } from "yjs";
import { isCssDeckFile } from "@/lib/file-types";
import { useAssetToken } from "@/lib/asset-token";
import {
	createMarpRenderer,
	isSlideTailwindReady,
	rewriteCssUrls,
	subscribeSlideTailwind,
	type SlideDisplay,
} from "@/lib/marp";
import { projectFileUrl } from "@/lib/project-file-url";
import { inlineProjectThemeFonts } from "@/lib/project-theme-fonts";
import { createProjectThemeStore } from "@/lib/project-theme-store";
import { upsertProjectTheme, type ProjectTheme } from "@/lib/project-themes";
import type { DeckFile } from "@/lib/types";

type ProjectRenderingOptions = {
	projectId: string;
	files: DeckFile[];
	stylesheetId: string | null;
	stylesheetText: Text | null;
	markdown: string;
	deckFileId: string | null;
};

export function useProjectRendering({
	projectId,
	files,
	stylesheetId,
	stylesheetText,
	markdown,
	deckFileId,
}: ProjectRenderingOptions) {
	const { renderer, themes } = useMemo(() => {
		const renderer = createMarpRenderer(projectId);
		return {
			renderer,
			themes: createProjectThemeStore(renderer.setProjectThemes, renderer.listThemeNames()),
		};
	}, [projectId]);
	const themeSnapshot = useSyncExternalStore(themes.subscribe, themes.getSnapshot);
	const assetToken = useAssetToken(projectId);
	const [assets, setAssets] = useState(() => ({
		projectId,
		files,
		version: 0,
		fontRequests: new Map<string, Promise<string | undefined>>(),
	}));
	// Project files have stable URLs. Re-uploaded files need a fresh cache key.
	if (assets.projectId !== projectId || assets.files !== files) {
		setAssets({
			projectId,
			files,
			version: assets.version + 1,
			fontRequests: new Map(),
		});
	}

	const prepareStylesheet = useCallback(
		(css: string, fileId: string) =>
			inlineProjectThemeFonts(
				rewriteCssUrls(css, projectId, fileId, assetToken),
				projectId,
				assets.fontRequests,
			),
		[projectId, assetToken, assets.fontRequests],
	);

	const activeStylesheetId = useRef(stylesheetId);
	const themeLoadEpoch = useRef(0);
	useEffect(() => {
		activeStylesheetId.current = stylesheetId;
	}, [stylesheetId]);

	useEffect(() => {
		const cssFiles = files.filter(isCssDeckFile);
		const controller = new AbortController();
		themeLoadEpoch.current += 1;

		async function loadThemes() {
			const loadedThemes = await Promise.all(
				cssFiles.map(async (file) => {
					try {
						const response = await fetch(projectFileUrl(projectId, file.id), {
							signal: controller.signal,
						});
						if (!response.ok) {
							return null;
						}
						return {
							id: file.id,
							css: await prepareStylesheet(await response.text(), file.id),
						};
					} catch {
						return null;
					}
				}),
			);
			if (controller.signal.aborted) {
				return;
			}

			themes.update((current) => {
				const fromFiles = loadedThemes.filter((theme): theme is ProjectTheme => theme !== null);
				const fromEditor = current.find((theme) => theme.id === activeStylesheetId.current);
				return fromEditor ? upsertProjectTheme(fromFiles, fromEditor) : fromFiles;
			});
		}

		void loadThemes();
		return () => controller.abort();
	}, [projectId, files, prepareStylesheet, themes]);

	useEffect(() => {
		// Unsynced text could replace a loaded theme with empty CSS.
		if (!stylesheetId || !stylesheetText) {
			return;
		}

		let generation = 0;
		async function applyTheme(fileId: string, text: Text) {
			const applied = ++generation;
			const epoch = themeLoadEpoch.current;
			// Embed fonts before registering the theme to avoid a flash of fallback fonts.
			// oxlint-disable-next-line no-base-to-string
			const embeddedCss = await prepareStylesheet(text.toString(), fileId);
			if (applied === generation && epoch === themeLoadEpoch.current) {
				themes.update((current) => upsertProjectTheme(current, { id: fileId, css: embeddedCss }));
			}
		}

		let timer: ReturnType<typeof setTimeout> | undefined;
		const scheduleTheme = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				void applyTheme(stylesheetId, stylesheetText);
			}, 150);
		};

		stylesheetText.observe(scheduleTheme);
		scheduleTheme();
		return () => {
			stylesheetText.unobserve(scheduleTheme);
			// Keep the last edit when switching away from the stylesheet.
			if (timer !== undefined) {
				clearTimeout(timer);
				void applyTheme(stylesheetId, stylesheetText);
			}
		};
	}, [stylesheetId, stylesheetText, prepareStylesheet, themes]);

	const slideTailwindReady = useSyncExternalStore(subscribeSlideTailwind, isSlideTailwindReady);
	const slides = useMemo<SlideDisplay>(() => {
		// Theme registration and the asynchronously loaded compiler affect the render.
		void themeSnapshot;
		void slideTailwindReady;
		try {
			return renderer.render(markdown, deckFileId, assets.version, assetToken);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				html: `<section><h1>Marp Render Error</h1><p>${message}</p></section>`,
				css: "",
				comments: [[]],
			};
		}
	}, [
		renderer,
		markdown,
		deckFileId,
		assets.version,
		assetToken,
		themeSnapshot,
		slideTailwindReady,
	]);

	return {
		projectThemes: themeSnapshot.themes,
		themeNames: themeSnapshot.names,
		analyzeSlides: renderer.analyzeSlides,
		slides,
	};
}
