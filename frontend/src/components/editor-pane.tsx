import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
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

type Participant = {
	id: string;
	name: string;
	color: string;
};

type EditorPaneProps = {
	label: string | null;
	yText: Y.Text | null;
	awareness: Awareness | null;
	undoManager: Y.UndoManager | null;
	status: "connecting" | "connected" | "disconnected";
};

const editorTheme = EditorView.theme({
	"&": {
		height: "100%",
		fontFamily: "'Geist Mono Variable', monospace",
		fontSize: "14px",
		backgroundColor: "var(--card)",
		color: "var(--card-foreground)",
	},
	".cm-scroller": {
		fontFamily: "'Geist Mono Variable', monospace",
		overflow: "auto",
		lineHeight: "1.65",
	},
	".cm-content": {
		fontFamily: "'Geist Mono Variable', monospace",
		minHeight: "100%",
		tabSize: "2",
		caretColor: "var(--primary)",
	},
	".cm-line": {
		padding: "0 6px",
	},
	".cm-gutters": {
		borderRight: "1px solid var(--border)",
		background: "color-mix(in oklab, var(--muted) 64%, transparent)",
		color: "var(--muted-foreground)",
		paddingRight: "6px",
	},
	".cm-lineNumbers .cm-gutterElement": {
		minWidth: "36px",
		padding: "0 10px 0 12px",
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
	"&.cm-focused": {
		outline: "none",
	},
});

export const EditorPane = ({ label, yText, awareness, undoManager, status }: EditorPaneProps) => {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const [participants, setParticipants] = useState<Participant[]>([]);

	const statusVariant = useMemo(() => {
		if (status === "connected") {
			return "default";
		}

		if (status === "connecting") {
			return "secondary";
		}

		return "outline";
	}, [status]);

	useEffect(() => {
		if (!mountRef.current || !yText || !awareness || !undoManager) {
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
				EditorView.lineWrapping,
				keymap.of([indentWithTab, ...yUndoManagerKeymap]),
				yCollab(yText, awareness, { undoManager }),
				editorTheme,
			],
		});

		const view = new EditorView({
			state,
			parent: mountRef.current,
		});

		return () => {
			view.destroy();
		};
	}, [yText, awareness, undoManager, label]);

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
					// To-Do fix this logic
					id: user.id ?? crypto.randomUUID(),
					name: user.name ?? "Unknown",
					color: user.color ?? "#0ea5e9",
				}));

			setParticipants(next);
		};

		update();
		awareness.on("change", update);

		return () => {
			awareness.off("change", update);
		};
	}, [awareness]);

	return (
		<Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/80 py-0">
			<CardHeader className="shrink-0 border-b border-border px-4 py-3">
				<CardTitle>Editor</CardTitle>
				<CardDescription className="font-mono text-[11px]">
					{label ?? "Bitte Datei wählen"}

					<div className="flex flex-wrap items-center gap-2 px-4 py-2">
						{participants.length === 0 ? (
							<p className="text-xs text-muted-foreground">No active collaborators yet</p>
						) : (
							participants.map((participant) => (
								<div
									key={participant.id}
									className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs"
								>
									<span
										className="h-2 w-2 rounded-full"
										style={{ backgroundColor: participant.color }}
									/>
									{participant.name}
								</div>
							))
						)}
					</div>
				</CardDescription>
				<CardAction>
					<Badge variant={statusVariant}>{status}</Badge>
				</CardAction>
			</CardHeader>

			<CardContent className="min-h-0 flex-1 p-0">
				{yText ? (
					<div ref={mountRef} className="h-full" />
				) : (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						Choose a file on the left to get started.
					</div>
				)}
			</CardContent>
		</Card>
	);
};
