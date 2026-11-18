import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon, ExternalLinkIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const MCP_DOCS_URL = "https://github.com/alex289/marp-collab/blob/main/docs/mcp.md";

type ClientId = "claude-code" | "codex" | "other";

const CLIENT_OPTIONS: { id: ClientId; label: string }[] = [
	{ id: "claude-code", label: "Claude Code" },
	{ id: "codex", label: "Codex" },
	{ id: "other", label: "Other clients" },
];

const CAPABILITIES = [
	"List projects & files",
	"Read decks",
	"Create decks",
	"Edit live",
	"Pull & push Git",
];

export function getMcpUrl() {
	return `${window.location.origin}/mcp`;
}

export function ConnectAiAssistantDialog({
	trigger,
	projectName,
}: {
	trigger?: React.ReactElement;
	projectName?: string | undefined;
}) {
	const [client, setClient] = useState<ClientId>("claude-code");
	const mcpUrl = getMcpUrl();
	const project = projectName ?? "Training";
	const examplePrompts = [
		`Create a ten-slide introduction to Kubernetes in my ${project} project.`,
		`Read the deck in ${project} and tighten every slide to three bullet points.`,
		`Add speaker notes to every slide in ${project} and push the changes to Git.`,
	];

	return (
		<Dialog>
			<DialogTrigger
				render={
					trigger ?? (
						<Button variant="outline">
							<SparklesIcon />
							Connect AI
						</Button>
					)
				}
			/>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
				<DialogHeader className="flex-row items-start gap-3">
					<AiBadgeIcon />
					<div className="flex flex-col gap-1">
						<DialogTitle>Connect an AI assistant</DialogTitle>
						<DialogDescription>
							MarpCollab is an MCP server. Connect Claude Code, Codex or any other MCP client and
							let it create, edit and version your decks, live alongside everyone else in the
							editor.
						</DialogDescription>
					</div>
				</DialogHeader>

				<ol className="flex flex-col gap-4">
					<Step number={1} title="Add the server to your assistant">
						<ToggleGroup
							value={[client]}
							onValueChange={(value) => {
								const next = value[0];
								if (next === "claude-code" || next === "codex" || next === "other") {
									setClient(next);
								}
							}}
							variant="outline"
							size="sm"
							spacing={0}
							aria-label="AI client"
						>
							{CLIENT_OPTIONS.map((option) => (
								<ToggleGroupItem key={option.id} value={option.id}>
									{option.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
						{client === "claude-code" ? (
							<>
								<CopyField
									value={`claude mcp add --transport http marp-collab ${mcpUrl}`}
									label="Claude Code command"
								/>
								<p className="text-muted-foreground">
									Then run <code className="font-mono">/mcp</code> in Claude Code to sign in.
								</p>
							</>
						) : client === "codex" ? (
							<>
								<CopyField
									value={`codex mcp add marp-collab --url ${mcpUrl}`}
									label="Codex command"
								/>
								<p className="text-muted-foreground">
									Codex opens the sign-in right away. Run{" "}
									<code className="font-mono">codex mcp login marp-collab</code> to sign in again
									later.
								</p>
							</>
						) : (
							<>
								<CopyField value={mcpUrl} label="MCP server URL" />
								<p className="text-muted-foreground">
									Add a remote MCP server using the{" "}
									<span className="text-foreground">Streamable HTTP</span> transport with this URL.
								</p>
							</>
						)}
					</Step>

					<Step number={2} title="Sign in and approve access">
						<p className="text-muted-foreground">
							Your assistant opens the usual MarpCollab login. Approve the requested permissions and
							it can work on every presentation you own or that is shared with you.
						</p>
					</Step>

					<Step number={3} title="Ask for what you need">
						<ul className="flex flex-col gap-1.5">
							{examplePrompts.map((prompt) => (
								<li key={prompt}>
									<ExamplePrompt prompt={prompt} />
								</li>
							))}
						</ul>
					</Step>
				</ol>

				<div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
					<div className="flex flex-wrap gap-1">
						{CAPABILITIES.map((capability) => (
							<span
								key={capability}
								className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[0.625rem] font-medium"
							>
								<CheckIcon className="size-2.5 text-emerald-500" />
								{capability}
							</span>
						))}
					</div>
					<p className="text-muted-foreground">
						No API key needed: your assistant writes the Markdown. It cannot delete projects or
						change collaborators, and every call is checked against your current permissions.
					</p>
				</div>

				<a
					href={MCP_DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 justify-self-start text-muted-foreground underline-offset-3 hover:text-foreground hover:underline"
				>
					Read the MCP documentation
					<ExternalLinkIcon className="size-3" />
				</a>
			</DialogContent>
		</Dialog>
	);
}

export function AiBadgeIcon({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm",
				className,
			)}
		>
			<SparklesIcon className="size-4" />
		</div>
	);
}

function Step({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
			<span className="flex size-5 items-center justify-center rounded-full bg-primary text-[0.625rem] font-semibold text-primary-foreground">
				{number}
			</span>
			<div className="flex flex-col gap-2">
				<p className="pt-0.5 font-medium leading-4">{title}</p>
				{children}
			</div>
		</li>
	);
}

async function copyToClipboard(value: string) {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		toast.error("Failed to copy to clipboard");
		return false;
	}
}

function useCopied() {
	const [copied, setCopied] = useState(false);
	const copy = async (value: string) => {
		if (await copyToClipboard(value)) {
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		}
	};
	return { copied, copy };
}

function CopyField({ value, label }: { value: string; label: string }) {
	const { copied, copy } = useCopied();

	return (
		<div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 py-1 pr-1 pl-2.5">
			<code className="min-w-0 flex-1 truncate font-mono text-[0.6875rem]" title={value}>
				{value}
			</code>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={`Copy ${label}`}
				onClick={() => void copy(value)}
			>
				{copied ? <CheckIcon className="text-emerald-500" /> : <CopyIcon />}
			</Button>
		</div>
	);
}

function ExamplePrompt({ prompt }: { prompt: string }) {
	const { copied, copy } = useCopied();

	return (
		<button
			type="button"
			onClick={() => void copy(prompt)}
			className="group flex w-full items-start gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left transition-colors hover:border-solid hover:bg-muted/50"
		>
			<span className="flex-1">“{prompt}”</span>
			{copied ? (
				<CheckIcon className="mt-0.5 size-3 shrink-0 text-emerald-500" />
			) : (
				<CopyIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
			)}
			<span className="sr-only">Copy prompt</span>
		</button>
	);
}
