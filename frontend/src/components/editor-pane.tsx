import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { basicSetup } from "codemirror";
import type { Awareness } from "y-protocols/awareness.js";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Copy, FileText, Maximize2, WrapText } from "lucide-react";
import { useTheme } from "./theme-provider";
import { vsCodeLight } from "@fsegurai/codemirror-theme-vscode-light";
import { vsCodeDark } from "@fsegurai/codemirror-theme-vscode-dark";
import { ManageProjectCollaborator } from "./dialog/manage-project-collaborator";
import { toast } from "sonner";
import { useHotkey } from "@tanstack/react-hotkeys";
import { countMarpSlides } from "@/lib/slide-count";

type EditorPaneProps = {
	label: string | null;
	yText: Y.Text | null;
	awareness: Awareness | null;
	undoManager: Y.UndoManager | null;
	readOnly: boolean;
	projectId: string;
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
});

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
	{ label, yText, awareness, undoManager, readOnly, projectId, onCursorLineChange },
	ref,
) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const [stats, setStats] = useState<EditorStats>(emptyStats);
	const [wrapEnabled, setWrapEnabled] = useState(true);
	const [isFocused, setIsFocused] = useState(false);
	const [copiedLabel, setCopiedLabel] = useState(false);
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

	const copyLabel = async () => {
		if (!label) {
			return;
		}

		await navigator.clipboard.writeText(label);
		setCopiedLabel(true);
		window.setTimeout(() => setCopiedLabel(false), 1200);
	};

	useEffect(() => {
		if (!mountRef.current || !yText || !awareness || !undoManager) {
			setStats(emptyStats);
			return;
		}

		const languageExtension = label?.endsWith(".css") ? css() : markdown();

		const state = EditorState.create({
			// oxlint-disable-next-line no-base-to-string
			doc: yText.toString(),
			extensions: [
				basicSetup,
				EditorState.tabSize.of(2),
				languageExtension,
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
				keymap.of([indentWithTab, ...yUndoManagerKeymap]),
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
			<CardHeader className="shrink-0 border-b border-border px-3 py-2">
				<div className="flex min-w-0 items-start gap-3">
					<div className="min-w-0">
						<CardTitle className="flex min-w-0 items-center gap-2">
							<span className="truncate">Editor</span>
							<Badge variant="outline">{fileKind}</Badge>
						</CardTitle>
						<CardDescription className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11px]">
							<span className="truncate">{label ?? "No file selected"}</span>
							{label ? (
								<Tooltip>
									<TooltipTrigger
										render={
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												aria-label="Copy file name"
												onClick={copyLabel}
											>
												{copiedLabel ? <Check /> : <Copy />}
											</Button>
										}
									/>
									<TooltipContent>{copiedLabel ? "Copied!" : "Copy file name"}</TooltipContent>
								</Tooltip>
							) : null}
						</CardDescription>
					</div>
				</div>
				<CardAction>
					<div className="flex items-center gap-2">
						{readOnly ? <Badge variant="outline">Read-only</Badge> : null}
						<ManageProjectCollaborator projectId={projectId} />
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
				</CardAction>
			</CardHeader>

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

			<div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-3 py-1">
				<div>
					<div
						className={`${isFocused ? "flex" : "hidden 2xl:flex"} min-w-0 flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground`}
					>
						<span>{stats.words.toLocaleString()} words</span>
						<span>{stats.chars.toLocaleString()} chars</span>
						{fileKind === "Markdown" ? <span>{stats.slides.toLocaleString()} slides</span> : null}
					</div>
				</div>
				<span className="font-mono text-[11px] text-muted-foreground">
					Ln {stats.cursorLine}, Col {stats.cursorColumn}
				</span>
			</div>
		</Card>
	);
});
