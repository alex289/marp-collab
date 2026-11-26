import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHotkey } from "@tanstack/react-hotkeys";
import { CircleHelpIcon, ExternalLinkIcon } from "lucide-react";
import { Fragment, useState } from "react";

const DOCS_URL = "https://github.com/alex289/marp-collab/blob/main/docs";

type HelpTab = "shortcuts" | "syntax";

/** A shortcut is a list of alternatives, each a list of keys pressed together. */
type Shortcut = { keys: string[][]; label: string };

type SyntaxTip = { title: string; description: string; code: string; docs?: string };

function isMacPlatform() {
	const platform = window.navigator.platform.toLowerCase();
	return platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad");
}

function shortcutGroups(isMac: boolean): { title: string; shortcuts: Shortcut[] }[] {
	const mod = isMac ? "⌘" : "Ctrl";
	const alt = isMac ? "⌥" : "Alt";

	return [
		{
			title: "Workspace",
			shortcuts: [
				{ keys: [[alt, "1"]], label: "Files" },
				{ keys: [[alt, "2"]], label: "Search across files" },
				{ keys: [[alt, "3"]], label: "Outline" },
				{ keys: [[alt, "4"]], label: "Slide overview" },
				{ keys: [["Shift", "F10"]], label: "Slide actions (on a thumbnail)" },
				{ keys: [["Shift", "Click"]], label: "Select a range of slides" },
				{ keys: [[alt, "5"]], label: "Settings" },
				{ keys: [["D"]], label: "Toggle dark mode" },
				{ keys: [["?"]], label: "Show this help" },
			],
		},
		{
			title: "Editor",
			shortcuts: [
				{ keys: [["Ctrl", "Space"]], label: "Suggest directives, paths & classes" },
				{ keys: [["Shift", alt, "F"]], label: "Format document" },
				{ keys: [[mod, "F"]], label: "Find & replace" },
				{ keys: [[mod, "Z"]], label: "Undo your own changes" },
				{ keys: [[mod, "Shift", "Z"]], label: "Redo" },
				{ keys: [["Esc"]], label: "Leave focus mode" },
			],
		},
		{
			title: "Presenting",
			shortcuts: [
				{ keys: [["→"], ["Space"]], label: "Next slide" },
				{ keys: [["←"]], label: "Previous slide" },
				{ keys: [["Shift"]], label: "Hold for laser pointer" },
				{ keys: [["Ctrl", "Scroll"]], label: "Zoom (or pinch)" },
				{ keys: [["Double-click"]], label: "Reset zoom" },
				{ keys: [["B"]], label: "Blank audience screen" },
				{ keys: [["L"]], label: "Start a demo in presenter view or end it from any linked window" },
				{ keys: [["F"]], label: "Toggle fullscreen (audience screen if open)" },
				{ keys: [["Esc"]], label: "End presentation" },
			],
		},
	];
}

const SYNTAX_TIPS: SyntaxTip[] = [
	{
		title: "Speaker notes",
		description: "Any HTML comment on a slide shows up in the presenter view.",
		code: "<!-- Mention the Q3 numbers here -->",
	},
	{
		title: "Presenter",
		description: "Shows who presents the slide, with their avatar, and who's up next.",
		code: "<!-- presenter: Ada Lovelace -->",
	},
	{
		title: "Live demo",
		description: "Marks a demo slide and sets the title shown during a live demo.",
		code: "<!-- demo: Show the login flow -->",
		docs: "live-demos.md",
	},
	{
		title: "Include other files",
		description: "Reuses the slides of another Markdown file in this project.",
		code: "<!-- @include: chapters/intro.md -->",
		docs: "markdown-includes.md",
	},
	{
		title: "Slide sections",
		description:
			"Groups slides in the slide overview. Right-click a thumbnail to start, rename or move one.",
		code: "<!-- section: Introduction -->",
		docs: "slide-overview.md",
	},
	{
		title: "Tailwind CSS",
		description: "Enables utility classes in HTML and slide classes. Add it to the frontmatter.",
		code: "tailwind: true",
		docs: "tailwind.md",
	},
	{
		title: "Slide transitions",
		description:
			"Animates leaving a slide while presenting. Use a built-in name or keyframes from your theme.",
		code: "<!-- transition: fade 1s -->",
		docs: "slide-transitions.md",
	},
	{
		title: "Images",
		description:
			"Paste or drop images into the editor, or drag files onto the file tree to upload.",
		code: "![bg right](images/photo.png)",
	},
];

export function HelpDialog({ triggerClassName }: { triggerClassName?: string }) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<HelpTab>("shortcuts");
	const isMac = isMacPlatform();

	useHotkey("?", () => setOpen((current) => !current), { conflictBehavior: "allow" });

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger
					render={
						<DialogTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Shortcuts and tips"
									className={triggerClassName}
								>
									<CircleHelpIcon />
								</Button>
							}
						/>
					}
				/>
				<TooltipContent>
					Shortcuts & tips
					<Kbd>?</Kbd>
				</TooltipContent>
			</Tooltip>
			<DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Shortcuts & tips</DialogTitle>
					<DialogDescription>
						Everything MarpCollab can do that isn't a button. Press <Kbd>?</Kbd> anywhere to open
						this again.
					</DialogDescription>
				</DialogHeader>
				<ToggleGroup
					value={[tab]}
					onValueChange={(value) => {
						const next = value[0];
						if (next === "shortcuts" || next === "syntax") {
							setTab(next);
						}
					}}
					variant="outline"
					size="sm"
					spacing={0}
					aria-label="Help section"
				>
					<ToggleGroupItem value="shortcuts">Keyboard shortcuts</ToggleGroupItem>
					<ToggleGroupItem value="syntax">Deck syntax</ToggleGroupItem>
				</ToggleGroup>
				<div className="-mx-4 min-h-0 overflow-y-auto px-4">
					{tab === "shortcuts" ? (
						<div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
							{shortcutGroups(isMac).map((group) => (
								<section
									key={group.title}
									className={group.title === "Presenting" ? "sm:col-span-2" : undefined}
								>
									<h3 className="mb-1.5 text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
										{group.title}
									</h3>
									<ul
										className={
											group.title === "Presenting" ? "grid gap-x-6 sm:grid-cols-2" : "flex flex-col"
										}
									>
										{group.shortcuts.map((shortcut) => (
											<li
												key={shortcut.label}
												className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5"
											>
												<span>{shortcut.label}</span>
												<ShortcutKeys keys={shortcut.keys} />
											</li>
										))}
									</ul>
								</section>
							))}
						</div>
					) : (
						<ul className="grid gap-2 sm:grid-cols-2">
							{SYNTAX_TIPS.map((tip) => (
								<li
									key={tip.title}
									className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<p className="font-medium">{tip.title}</p>
										{tip.docs ? (
											<a
												href={`${DOCS_URL}/${tip.docs}`}
												target="_blank"
												rel="noopener noreferrer"
												aria-label={`${tip.title} documentation`}
												className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
											>
												Docs
												<ExternalLinkIcon className="size-3" />
											</a>
										) : null}
									</div>
									<p className="text-muted-foreground">{tip.description}</p>
									<code className="mt-auto truncate rounded-md bg-muted px-2 py-1 font-mono text-[0.6875rem]">
										{tip.code}
									</code>
								</li>
							))}
						</ul>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function ShortcutKeys({ keys }: { keys: string[][] }) {
	return (
		<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
			{keys.map((combo, index) => (
				<Fragment key={combo.join("+")}>
					{index > 0 ? <span className="text-[0.625rem]">or</span> : null}
					<KbdGroup>
						{combo.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</Fragment>
			))}
		</span>
	);
}
