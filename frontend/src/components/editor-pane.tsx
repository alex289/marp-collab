import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { basicSetup } from "codemirror";
import type { Awareness } from "y-protocols/awareness.js";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Loader2Icon, Maximize2, WandSparkles, WrapText } from "lucide-react";
import { useTheme } from "./theme-provider";
import { vsCodeLight } from "@fsegurai/codemirror-theme-vscode-light";
import { vsCodeDark } from "@fsegurai/codemirror-theme-vscode-dark";
import { toast } from "sonner";
import { useHotkey } from "@tanstack/react-hotkeys";
import { countMarpSlides } from "@/lib/slide-count";
import { cn } from "@/lib/utils";
import type { DeckFile } from "@/lib/types";
import type { ProjectTheme } from "@/lib/project-themes";
import {
	createEditorCompletionSource,
	type EditorCompletionConfig,
} from "@/features/editor/completions";
import { marpMarkdown } from "@/features/editor/language";

type EditorPaneProps = {
	label: string | null;
	fileId: string | null;
	files: DeckFile[];
	themeNames: string[];
	projectThemes: ProjectTheme[];
	yText: Y.Text | null;
	awareness: Awareness | null;
	undoManager: Y.UndoManager | null;
	readOnly: boolean;
	onCursorLineChange?: (line: number) => void;
};

export type EditorPaneHandle = {
	jumpToLine: (line: number) => void;
	jumpToOffset: (offset: number) => void;
};

type EditorStats = {
	chars: number;
	words: number;
	lines: number;
	cursorLine: number;
	cursorColumn: number;
	slides: number;
};

const emptyStats: EditorStats = {
	chars: 0,
	words: 0,
	lines: 0,
	cursorLine: 1,
	cursorColumn: 1,
	slides: 0,
};

function getEditorStats(view: EditorView): EditorStats {
	const doc = view.state.doc;
	const text = doc.toString();
	const cursor = view.state.selection.main.head;
	const cursorLine = doc.lineAt(cursor);
	const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
	const slides = countMarpSlides(text);

	return {
		chars: text.length,
		words,
		lines: doc.lines,
		cursorLine: cursorLine.number,
		cursorColumn: cursor - cursorLine.from + 1,
		slides,
	};
}

let prettierModulesPromise: Promise<{
	prettier: typeof import("prettier/standalone");
	markdown: typeof import("prettier/plugins/markdown");
	postcss: typeof import("prettier/plugins/postcss");
}> | null = null;

async function importPrettierModules() {
	const [prettier, markdownPlugin, postcssPlugin] = await Promise.all([
		import("prettier/standalone"),
		import("prettier/plugins/markdown"),
		import("prettier/plugins/postcss"),
	]);
	return { prettier, markdown: markdownPlugin, postcss: postcssPlugin };
}

function loadPrettierModules() {
	if (!prettierModulesPromise) {
		prettierModulesPromise = importPrettierModules();
	}
	return prettierModulesPromise;
}

const editorTheme = EditorView.theme({
	"&": {
		height: "100%",
		fontFamily: "'Geist Mono Variable', monospace",
		fontSize: "14px",
		backgroundColor: "var(--card)",
		color: "var(--card-foreground)",
	},
	".cm-gutters": {
		borderRight: "none",
		background: "transparent",
		color: "color-mix(in oklab, var(--muted-foreground) 70%, transparent)",
		paddingRight: "6px",
	},
	".cm-activeLine": {
		backgroundColor: "color-mix(in oklab, var(--primary) 7%, transparent)",
	},
	".cm-activeLineGutter": {
		backgroundColor: "color-mix(in oklab, var(--primary) 10%, transparent) !important",
		color: "var(--foreground)",
	},
	".cm-cursor": {
		borderLeftColor: "var(--primary)",
	},
	".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
		backgroundColor: "color-mix(in oklab, var(--primary) 24%, transparent)",
	},
	".cm-matchingBracket, .cm-nonmatchingBracket": {
		backgroundColor: "color-mix(in oklab, var(--primary) 14%, transparent)",
		outline: "1px solid color-mix(in oklab, var(--primary) 42%, transparent)",
	},
	".cm-foldPlaceholder": {
		border: "1px solid var(--border)",
		backgroundColor: "var(--muted)",
		color: "var(--muted-foreground)",
	},
	"&.cm-focused": {
		outline: "none",
	},
	".cm-ySelectionInfo": {
		fontFamily: "'Geist Variable', monospace",
	},
	".cm-panels": {
		color: "var(--card-foreground)",
		backgroundColor: "var(--card)",
	},
	".cm-panels-top": {
		borderBottom: "1px solid var(--border)",
	},
	".cm-panels-bottom": {
		borderTop: "1px solid var(--border)",
	},
	".cm-panel.cm-search": {
		padding: "8px 10px",
		fontFamily: "'Geist Variable', sans-serif",
		fontSize: "12px",
	},
	".cm-panel.cm-search label": {
		display: "inline-flex",
		alignItems: "center",
		gap: "4px",
		color: "var(--muted-foreground)",
	},
	".cm-panel.cm-search input[type=checkbox]": {
		accentColor: "var(--primary)",
	},
	".cm-panel.cm-search .cm-textfield": {
		border: "1px solid var(--border)",
		borderRadius: "var(--radius-sm)",
		backgroundColor: "var(--background)",
		color: "var(--foreground)",
		padding: "3px 6px",
		outline: "none",
	},
	".cm-panel.cm-search .cm-textfield:focus": {
		borderColor: "var(--ring)",
		boxShadow: "0 0 0 3px color-mix(in oklab, var(--ring) 30%, transparent)",
	},
	".cm-panel.cm-search .cm-button": {
		border: "1px solid var(--border)",
		borderRadius: "var(--radius-sm)",
		backgroundColor: "var(--secondary)",
		color: "var(--secondary-foreground)",
		backgroundImage: "none",
		padding: "3px 8px",
		cursor: "pointer",
	},
	".cm-panel.cm-search .cm-button:hover": {
		backgroundColor: "color-mix(in oklab, var(--secondary) 80%, var(--foreground) 10%)",
	},
	".cm-panel.cm-search [name=close]": {
		color: "var(--muted-foreground)",
		fontSize: "16px",
		cursor: "pointer",
	},
	".cm-panel.cm-search [name=close]:hover": {
		color: "var(--foreground)",
	},
	".cm-searchMatch": {
		backgroundColor: "color-mix(in oklab, var(--primary) 24%, transparent)",
	},
	".cm-searchMatch-selected": {
		backgroundColor: "color-mix(in oklab, var(--primary) 45%, transparent)",
	},
	".cm-tooltip-autocomplete": {
		border: "1px solid var(--border)",
		borderRadius: "var(--radius-md)",
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
		boxShadow: "var(--shadow-lg)",
		fontFamily: "'Geist Variable', sans-serif",
		overflow: "hidden",
	},
	".cm-tooltip-autocomplete > ul": {
		fontFamily: "inherit",
		maxHeight: "min(320px, 40vh)",
	},
	".cm-tooltip-autocomplete > ul > li": {
		padding: "4px 8px",
	},
	".cm-tooltip-autocomplete > ul > li[aria-selected]": {
		backgroundColor: "color-mix(in oklab, var(--primary) 30%, var(--popover))",
		color: "var(--accent-foreground)",
	},
	".cm-completionLabel": {
		fontFamily: "'Geist Mono Variable', monospace",
	},
	".cm-completionDetail": {
		color: "var(--muted-foreground)",
		fontStyle: "normal",
		marginLeft: "12px",
	},
	".cm-completionInfo": {
		border: "1px solid var(--border)",
		borderRadius: "var(--radius-md)",
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
		boxShadow: "var(--shadow-lg)",
		fontFamily: "'Geist Variable', sans-serif",
		fontSize: "12px",
		lineHeight: "1.45",
		padding: "8px 10px",
	},
	".cm-completionSection": {
		backgroundColor: "var(--muted)",
		color: "var(--muted-foreground)",
		fontSize: "10px",
		fontWeight: "600",
		letterSpacing: "0.04em",
		padding: "3px 8px",
		textTransform: "uppercase",
	},
});

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
	{
		label,
		fileId,
		files,
		themeNames,
		projectThemes,
		yText,
		awareness,
		undoManager,
		readOnly,
		onCursorLineChange,
	},
	ref,
) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const [stats, setStats] = useState<EditorStats>(emptyStats);
	const [wrapEnabled, setWrapEnabled] = useState(true);
	const [isFocused, setIsFocused] = useState(false);
	const [isFormatting, setIsFormatting] = useState(false);
	const handleFormatRef = useRef<() => void>(() => undefined);
	const { resolvedTheme } = useTheme();

	const fileKind = useMemo(() => {
		if (!label) {
			return "No file";
		}

		if (label.endsWith(".css")) {
			return "CSS";
		}

		return "Markdown";
	}, [label]);
	const completionConfigRef = useRef<EditorCompletionConfig>({
		fileKind: "markdown",
		currentFileId: null,
		files: [],
		themeNames: [],
		projectThemes: [],
	});
	completionConfigRef.current = {
		fileKind: fileKind === "CSS" ? "css" : "markdown",
		currentFileId: fileId,
		files,
		themeNames,
		projectThemes,
	};
	const completionSource = useMemo(
		() => createEditorCompletionSource(() => completionConfigRef.current),
		[],
	);

	const handleFormat = useCallback(async () => {
		const view = viewRef.current;
		if (!view || readOnly || fileKind === "No file" || isFormatting) {
			return;
		}

		setIsFormatting(true);
		try {
			const { prettier, markdown: markdownPlugin, postcss } = await loadPrettierModules();
			const source = view.state.doc.toString();
			const formatted = await prettier.format(source, {
				parser: fileKind === "CSS" ? "css" : "markdown",
				plugins: [fileKind === "CSS" ? postcss : markdownPlugin],
			});

			// Bail if a collaborator's edit landed while we were awaiting the format.
			const currentView = viewRef.current;
			if (!currentView || currentView.state.doc.toString() !== source || formatted === source) {
				return;
			}

			const nextPos = Math.min(currentView.state.selection.main.head, formatted.length);
			currentView.dispatch({
				changes: { from: 0, to: currentView.state.doc.length, insert: formatted },
				selection: { anchor: nextPos },
				effects: EditorView.scrollIntoView(nextPos, { y: "center" }),
			});
			currentView.focus();
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not format document: ${error.message}`
					: "Could not format document",
			);
		} finally {
			setIsFormatting(false);
		}
	}, [readOnly, fileKind, isFormatting]);

	useEffect(() => {
		handleFormatRef.current = handleFormat;
	}, [handleFormat]);

	useEffect(() => {
		if (!mountRef.current || !yText || !awareness || !undoManager) {
			setStats(emptyStats);
			return;
		}

		const languageExtension = label?.endsWith(".css") ? css() : marpMarkdown();

		const state = EditorState.create({
			// oxlint-disable-next-line no-base-to-string
			doc: yText.toString(),
			extensions: [
				basicSetup,
				EditorState.tabSize.of(2),
				languageExtension,
				EditorState.languageData.of(() => [{ autocomplete: completionSource }]),
				Prec.highest(
					keymap.of([
						{
							key: "Mod-s",
							run: () => {
								toast("Marp Collab automatically saves your changes. 🚀", {
									position: "bottom-center",
								});
								return true;
							},
						},
					]),
				),
				keymap.of([
					indentWithTab,
					{
						key: "Shift-Alt-f",
						run: () => {
							handleFormatRef.current();
							return true;
						},
					},
					...yUndoManagerKeymap,
				]),
				EditorState.readOnly.of(readOnly),
				EditorView.editable.of(!readOnly),
				yCollab(yText, awareness, { undoManager }),
				EditorView.updateListener.of((update) => {
					if (update.docChanged || update.selectionSet) {
						const nextStats = getEditorStats(update.view);
						setStats(nextStats);
						onCursorLineChange?.(nextStats.cursorLine);
					}
				}),
				wrapEnabled ? EditorView.lineWrapping : [],
				resolvedTheme === "dark" ? vsCodeDark : vsCodeLight,
				Prec.highest(editorTheme),
			],
		});

		const view = new EditorView({
			state,
			parent: mountRef.current,
		});
		viewRef.current = view;
		setStats(getEditorStats(view));

		return () => {
			if (viewRef.current === view) {
				viewRef.current = null;
			}
			view.destroy();
		};
	}, [
		yText,
		awareness,
		undoManager,
		label,
		resolvedTheme,
		wrapEnabled,
		readOnly,
		onCursorLineChange,
		completionSource,
	]);

	useImperativeHandle(ref, () => ({
		jumpToLine(line: number) {
			const view = viewRef.current;
			if (!view) {
				return;
			}

			const targetLine = Math.min(Math.max(1, line), view.state.doc.lines);
			const docLine = view.state.doc.line(targetLine);
			view.dispatch({
				selection: { anchor: docLine.from },
				effects: EditorView.scrollIntoView(docLine.from, { y: "start" }),
			});
			view.focus();
		},
		jumpToOffset(offset: number) {
			const view = viewRef.current;
			if (!view) {
				return;
			}

			const position = Math.min(Math.max(0, offset), view.state.doc.length);
			view.dispatch({
				selection: { anchor: position },
				effects: EditorView.scrollIntoView(position, { y: "center" }),
			});
			view.focus();
		},
	}));

	useHotkey(
		"Escape",
		() => {
			setIsFocused(false);
		},
		{ enabled: isFocused, conflictBehavior: "allow" },
	);

	return (
		<Card
			className={
				isFocused
					? "fixed inset-4 z-50 flex min-h-0 flex-col gap-0 overflow-hidden rounded-lg bg-card py-0 shadow-2xl ring-1 ring-border"
					: "flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-none py-0 ring-0"
			}
		>
			<CardContent className="relative min-h-0 flex-1 p-0">
				{yText ? (
					<div ref={mountRef} className="h-full" />
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
						<div className="flex size-12 items-center justify-center rounded-md border border-dashed border-border bg-muted/40">
							<FileText className="size-5" />
						</div>
						<span>Choose a file on the left to get started.</span>
					</div>
				)}
			</CardContent>

			<Separator />
			<CardFooter className="h-7 shrink-0 gap-3 bg-background px-2 py-1">
				<div
					className={cn(
						"min-w-0 flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground",
						isFocused ? "flex" : "hidden 2xl:flex",
					)}
				>
					<span>{stats.words.toLocaleString()} words</span>
					<span>{stats.chars.toLocaleString()} chars</span>
					{fileKind === "Markdown" ? <span>{stats.slides.toLocaleString()} slides</span> : null}
				</div>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					{readOnly ? <Badge variant="outline">Read-only</Badge> : null}
					<span className="mr-1 font-mono text-[11px] text-muted-foreground">
						Ln {stats.cursorLine}, Col {stats.cursorColumn}
					</span>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									aria-label="Format document"
									disabled={!yText || !label || readOnly || fileKind === "No file" || isFormatting}
									onClick={() => void handleFormat()}
								>
									{isFormatting ? <Loader2Icon className="animate-spin" /> : <WandSparkles />}
								</Button>
							}
						/>
						<TooltipContent>
							<span>Format document (Shift-Alt-F)</span>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant={wrapEnabled ? "secondary" : "outline"}
									size="icon-sm"
									aria-label={wrapEnabled ? "Disable line wrapping" : "Enable line wrapping"}
									onClick={() => setWrapEnabled((current) => !current)}
								>
									<WrapText />
								</Button>
							}
						/>
						<TooltipContent>
							<span>{wrapEnabled ? "Disable line wrapping" : "Enable line wrapping"}</span>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant={isFocused ? "secondary" : "outline"}
									size="icon-sm"
									aria-label={isFocused ? "Exit focus mode" : "Enter focus mode"}
									onClick={() => setIsFocused((current) => !current)}
								>
									<Maximize2 />
								</Button>
							}
						/>
						<TooltipContent>
							<span>{isFocused ? "Exit focus mode" : "Enter focus mode"}</span>
						</TooltipContent>
					</Tooltip>
				</div>
			</CardFooter>
		</Card>
	);
});
