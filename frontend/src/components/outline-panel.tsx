import { ListTree } from "lucide-react";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import type { OutlineItem } from "@/lib/outline";

type OutlinePanelProps = {
	items: OutlineItem[];
	isMarkdown: boolean;
	onSelectLine: (line: number) => void;
};

export const OutlinePanel = ({ items, isMarkdown, onSelectLine }: OutlinePanelProps) => {
	return (
		<SidebarGroup className="h-full">
			<SidebarGroupLabel className="flex items-center gap-2 pb-2 pl-0">
				<ListTree className="size-4" />
				<span>Outline</span>
			</SidebarGroupLabel>
			<SidebarGroupContent className="h-full min-h-0 overflow-y-auto pr-1">
				{!isMarkdown ? (
					<p className="px-2 text-xs text-muted-foreground">
						Outline is available for Markdown files.
					</p>
				) : items.length === 0 ? (
					<p className="px-2 text-xs text-muted-foreground">No headings in this file.</p>
				) : (
					<div className="grid min-w-0 gap-1">
						{items.map((item) => (
							<button
								key={`${item.line}:${item.text}`}
								type="button"
								onClick={() => onSelectLine(item.line)}
								className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent"
								style={{
									paddingLeft:
										item.kind === "heading" ? `${1 + (item.level - 1) * 0.75}rem` : "0.5rem",
								}}
							>
								<span className="min-w-6 shrink-0 text-muted-foreground">{item.line}</span>
								<span className={item.kind === "slide" ? "truncate font-medium" : "truncate"}>
									{item.text}
								</span>
							</button>
						))}
					</div>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
};
