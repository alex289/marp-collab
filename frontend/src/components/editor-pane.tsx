import { useEffect, useMemo, useRef, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Save } from "lucide-react";
import { HotkeyLabel } from "./hotkey-lable";
import { useTheme } from "./theme-provider";
import { vsCodeLight } from "@fsegurai/codemirror-theme-vscode-light";
import { vsCodeDark } from "@fsegurai/codemirror-theme-vscode-dark";
import { ManageProjectCollaborator } from "./dialog/manage-project-collaborator";

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
	projectId: string;
};

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
	"&.cm-focused": {
		outline: "none",
	},
});

export const EditorPane = ({
	label,
	yText,
	awareness,
	undoManager,
	status,
	projectId,
}: EditorPaneProps) => {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const [participants, setParticipants] = useState<Participant[]>([]);
	const { theme } = useTheme();

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
				Prec.highest(
					keymap.of([
						{
							key: "Mod-s",
							run: () => true,
						},
					]),
				),
				keymap.of([indentWithTab, ...yUndoManagerKeymap]),
				yCollab(yText, awareness, { undoManager }),
				theme === "dark" ? vsCodeDark : vsCodeLight,
				Prec.highest(editorTheme),
			],
		});

		const view = new EditorView({
			state,
			parent: mountRef.current,
		});

		return () => {
			view.destroy();
		};
	}, [yText, awareness, undoManager, label, theme]);

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
					<div className="flex items-center gap-2">
						<ManageProjectCollaborator projectId={projectId} />
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="outline"
										size="sm"
										title="Document saves automatically"
										aria-label="Save document"
										onClick={() =>
											mountRef.current?.querySelector<HTMLElement>(".cm-content")?.focus()
										}
									>
										<Save />
										<span>Save</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<span>Document saves automatically</span>
									<HotkeyLabel hotkey="S" />
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
						<Badge variant={statusVariant}>{status}</Badge>
					</div>
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
