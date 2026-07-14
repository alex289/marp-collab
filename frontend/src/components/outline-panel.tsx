import { ListTree } from "lucide-react";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import type { OutlineItem } from "@/lib/outline";
import { Button } from "./ui/button";

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
							<Button
								key={`${item.line}:${item.text}`}
								type="button"
								variant="ghost"
								onClick={() => onSelectLine(item.line)}
								className="flex min-w-0 justify-start gap-2 px-2 py-1.5 text-xs"
								style={{
									paddingLeft: `${1 + (item.level - 1) * 0.75}rem`,
								}}
							>
								<span className="min-w-6 shrink-0 text-muted-foreground">{item.line}</span>
								<span className="truncate text-foreground">{item.text}</span>
							</Button>
						))}
					</div>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
};
