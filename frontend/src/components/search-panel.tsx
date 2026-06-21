import { useMemo, useState } from "react";
import { Replace, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import type { TextSearchMatch } from "@/lib/text-search";

type SearchPanelProps = {
	matches: TextSearchMatch[];
	isLoading: boolean;
	error: string | null;
	onSearch: (query: string) => void;
	onReplaceOne: (match: TextSearchMatch, replacement: string) => void;
	onReplaceAll: (query: string, replacement: string) => void;
};

export const SearchPanel = ({
	matches,
	isLoading,
	error,
	onSearch,
	onReplaceOne,
	onReplaceAll,
}: SearchPanelProps) => {
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");

	const grouped = useMemo(() => {
		const groups = new Map<string, TextSearchMatch[]>();
		for (const match of matches) {
			groups.set(match.fileId, [...(groups.get(match.fileId) ?? []), match]);
		}
		return Array.from(groups.entries());
	}, [matches]);

	return (
		<SidebarGroup className="h-full">
			<SidebarGroupLabel className="flex items-center gap-2 pb-2 pl-0">
				<Search className="size-4" />
				<span>Search</span>
			</SidebarGroupLabel>
			<SidebarGroupContent className="flex h-full min-h-0 flex-col gap-2">
				<Label
					className="text-xs font-medium text-muted-foreground"
					htmlFor="active-file-search-query"
				>
					Find
				</Label>
				<Input
					id="active-file-search-query"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							onSearch(query);
						}
					}}
					aria-label="Find"
				/>
				<Label
					className="text-xs font-medium text-muted-foreground"
					htmlFor="active-file-search-replacement"
				>
					Replace
				</Label>
				<Input
					id="active-file-search-replacement"
					value={replacement}
					onChange={(event) => setReplacement(event.target.value)}
					aria-label="Replace"
				/>
				<div className="flex min-w-0 gap-1">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => onSearch(query)}
						disabled={query.length === 0 || isLoading}
					>
						<Search />
						Find
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={() => onReplaceAll(query, replacement)}
						disabled={query.length === 0 || matches.length === 0 || isLoading}
					>
						<Replace />
						Replace all
					</Button>
				</div>
				{error ? <p className="text-xs text-destructive">{error}</p> : null}
				<p className="text-xs text-muted-foreground">
					{isLoading ? "Searching..." : `${matches.length} matches`}
				</p>
				<div className="min-h-0 flex-1 overflow-y-auto pr-1">
					{grouped.map(([fileId, fileMatches]) => (
						<div key={fileId} className="mb-3 min-w-0">
							<p className="mb-1 truncate text-xs font-medium">{fileId}</p>
							<div className="grid gap-1">
								{fileMatches.map((match) => (
									<div
										key={`${match.fileId}:${match.startOffset}:${match.endOffset}`}
										className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-sidebar-border p-2 text-xs"
									>
										<div className="min-w-0">
											<span className="mb-1 block text-muted-foreground">
												Line {match.line}, column {match.column}
											</span>
											<span className="block truncate font-mono">{match.linePreview}</span>
										</div>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="size-8"
											title="Replace this match"
											aria-label="Replace this match"
											onClick={() => onReplaceOne(match, replacement)}
										>
											<Replace />
										</Button>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</SidebarGroupContent>
		</SidebarGroup>
	);
};
