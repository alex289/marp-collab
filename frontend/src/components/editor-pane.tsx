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
	Avatar,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from "@/components/ui/avatar";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Copy, FileText, Maximize2, Sparkles, Users, WrapText } from "lucide-react";
import { useTheme } from "./theme-provider";
import { vsCodeLight } from "@fsegurai/codemirror-theme-vscode-light";
import { vsCodeDark } from "@fsegurai/codemirror-theme-vscode-dark";
import { ManageProjectCollaborator } from "./dialog/manage-project-collaborator";
import { toast } from "sonner";
import { getInitials } from "@/lib/utils";
import { useHotkey } from "@tanstack/react-hotkeys";

type Participant = {
	id: string;
	name: string;
	color: string;
	image: string | null;
};

type EditorPaneProps = {
	label: string | null;
	yText: Y.Text | null;
	awareness: Awareness | null;
	undoManager: Y.UndoManager | null;
	status: "connecting" | "connected" | "disconnected";
	readOnly: boolean;
	projectId: string;
};

export type EditorPaneHandle = {
	jumpToLine: (line: number) => void;
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
	const slides = text
		.split(/\r\n|\n|\r/)
		.filter((line) => line.trim() === "---" || line.trim().startsWith("# ")).length;

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
		borderRight: "1px solid var(--border)",
		background: "color-mix(in oklab, var(--muted) 64%, transparent)",
		color: "var(--muted-foreground)",
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
});

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
	{ label, yText, awareness, undoManager, status, readOnly, projectId },
	ref,
) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const [participants, setParticipants] = useState<Participant[]>([]);
	const [stats, setStats] = useState<EditorStats>(emptyStats);
	const [wrapEnabled, setWrapEnabled] = useState(true);
	const [isFocused, setIsFocused] = useState(false);
	const [copiedLabel, setCopiedLabel] = useState(false);
	const { resolvedTheme } = useTheme();

	const statusVariant = useMemo(() => {
		if (status === "connected") {
			return "default";
		}

		if (status === "connecting") {
			return "secondary";
		}

		return "outline";
	}, [status]);

	const fileKind = useMemo(() => {
		if (!label) {
			return "No file";
		}

		if (label.endsWith(".css")) {
			return "CSS";
		}

		return "Markdown";
	}, [label]);

	const visibleParticipants = participants.slice(0, 4);
	const hiddenParticipants = Math.max(0, participants.length - visibleParticipants.length);

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
						setStats(getEditorStats(update.view));
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
	}, [yText, awareness, undoManager, label, resolvedTheme, wrapEnabled, readOnly]);

	useEffect(() => {
		if (!awareness) {
			setParticipants([]);
			return;
		}

		const update = () => {
			const next = Array.from(awareness.getStates().values())
				.map((state) => state.user as Partial<Participant> | undefined)
				.filter((user): user is Partial<Participant> => Boolean(user))
				.map((user) => ({
					id: user.id ?? crypto.randomUUID(),
					name: user.name ?? "Unknown",
					color: user.color ?? "#0ea5e9",
					image: user.image ?? null,
				}));

			setParticipants(next);
		};

		update();
		awareness.on("change", update);

		return () => {
			awareness.off("change", update);
		};
	}, [awareness]);

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
				effects: EditorView.scrollIntoView(docLine.from, { y: "center" }),
			});
			view.focus();
		},
	}));

	useHotkey(
		"Escape",
		() => {
			setIsFocused(false);
		},
		{ enabled: isFocused },
	);

	return (
		<Card
			className={
				isFocused
					? "fixed inset-4 z-50 flex min-h-0 flex-col gap-0 overflow-hidden border-border/80 bg-card py-0 shadow-2xl"
					: "flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/80 py-0"
			}
		>
			<CardHeader className="shrink-0 border border-border bg-card/95 px-4 py-3 backdrop-blur">
				<div className="flex min-w-0 items-start gap-3">
					<div className="min-w-0">
						<CardTitle className="flex min-w-0 items-center gap-2">
							<span className="truncate">Editor</span>
							<Badge variant="outline">{fileKind}</Badge>
						</CardTitle>
						<CardDescription className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11px]">
							<span className="truncate">{label ?? "Bitte Datei wählen"}</span>
							{label ? (
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Copy file name"
									onClick={copyLabel}
								>
									{copiedLabel ? <Check /> : <Copy />}
								</Button>
							) : null}
						</CardDescription>
					</div>
				</div>
				<CardAction>
					<div className="flex items-center gap-2">
						<Badge variant={statusVariant} className="capitalize">
							<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
							{status}
						</Badge>
						{readOnly ? <Badge variant="outline">Read-only</Badge> : null}
						<ManageProjectCollaborator projectId={projectId} />
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant={wrapEnabled ? "secondary" : "outline"}
										size="icon-sm"
										aria-label={wrapEnabled ? "Disable line wrapping" : "Enable line wrapping"}
										onClick={() => setWrapEnabled((current) => !current)}
									>
										<WrapText />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<span>{wrapEnabled ? "Disable line wrapping" : "Enable line wrapping"}</span>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant={isFocused ? "secondary" : "outline"}
										size="icon-sm"
										aria-label={isFocused ? "Exit focus mode" : "Enter focus mode"}
										onClick={() => setIsFocused((current) => !current)}
									>
										<Maximize2 />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<span>{isFocused ? "Exit focus mode" : "Enter focus mode"}</span>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</CardAction>
			</CardHeader>

			<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/35 px-4 py-2">
				{isFocused ? (
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<Badge variant="outline">{stats.lines.toLocaleString()} lines</Badge>
						<Badge variant="outline">{stats.words.toLocaleString()} words</Badge>
						<Badge variant="outline">{stats.chars.toLocaleString()} chars</Badge>
						{fileKind === "Markdown" ? (
							<Badge variant="outline">
								<Sparkles />
								{stats.slides.toLocaleString()} slides
							</Badge>
						) : null}
					</div>
				) : (
					<div></div>
				)}
				<div className="flex min-w-0 items-center gap-3">
					<div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
						<Users className="size-3" />
						<span>{participants.length} online</span>
					</div>
					<AvatarGroup>
						{visibleParticipants.map((participant) => (
							<TooltipProvider key={participant.id}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Avatar size="sm" className="ring-1 ring-card after:border-0">
											{participant.image ? (
												<AvatarImage src={participant.image} alt={participant.name} />
											) : null}
											<AvatarFallback
												className="text-white"
												style={{ backgroundColor: participant.color }}
											>
												{getInitials(participant.name)}
											</AvatarFallback>
										</Avatar>
									</TooltipTrigger>
									<TooltipContent>{participant.name}</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						))}
						{hiddenParticipants > 0 ? (
							<AvatarGroupCount>+{hiddenParticipants}</AvatarGroupCount>
						) : null}
					</AvatarGroup>
					<span className="font-mono text-[11px] text-muted-foreground">
						Ln {stats.cursorLine}, Col {stats.cursorColumn}
					</span>
				</div>
			</div>

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
		</Card>
	);
});
