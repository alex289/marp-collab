import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
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
	},
	".cm-scroller": {
		fontFamily: "'Geist Mono Variable', monospace",
		overflow: "auto",
	},
	".cm-content": {
		fontFamily: "'Geist Mono Variable', monospace",
		minHeight: "100%",
		padding: "16px",
	},
	".cm-gutters": {
		borderRight: "1px solid hsl(var(--border))",
		background: "hsl(var(--card))",
	},
	".cm-activeLineGutter": {
		backgroundColor: "var(--secondary) !important",
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

		const state = EditorState.create({
			// oxlint-disable-next-line no-base-to-string
			doc: yText.toString(),
			extensions: [
				basicSetup,
				markdown(),
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
	}, [yText, awareness, undoManager]);

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
		<Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/80">
			<CardHeader className="border-b border-border">
				<CardTitle>Editor</CardTitle>
				<CardDescription>
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

			<CardContent className="p-0">
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
