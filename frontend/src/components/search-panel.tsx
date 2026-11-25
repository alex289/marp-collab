import { useState } from "react";
import { CaseSensitive, ChevronDown, ChevronRight, Loader2, Replace, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getMatchPreviewSegments } from "@/lib/text-search";
import type { useProjectSearch } from "@/hooks/use-project-search";

export function SearchPanel({
	files,
	totalMatches,
	truncated,
	readOnly,
	isSearching,
	isReplacing,
	error,
	onSearch,
	onReplaceOne,
	onReplaceInFile,
	onReplaceAll,
	onSelectMatch,
}: ReturnType<typeof useProjectSearch>) {
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [collapsedFiles, setCollapsedFiles] = useState<ReadonlySet<string>>(new Set());

	const busy = isSearching || isReplacing;

	const toggleFileCollapsed = (fileId: string) => {
		setCollapsedFiles((previous) => {
			const next = new Set(previous);
			if (next.has(fileId)) {
				next.delete(fileId);
			} else {
				next.add(fileId);
			}
			return next;
		});
	};

	const toggleCaseSensitive = () => {
		const next = !caseSensitive;
		setCaseSensitive(next);
		if (query.length > 0) {
			onSearch(query, next);
		}
	};

	const summaryText =
		totalMatches === 0
			? "0 matches"
			: `${totalMatches} ${totalMatches === 1 ? "match" : "matches"} in ${files.length} ${files.length === 1 ? "file" : "files"}${truncated ? " (limit reached)" : ""}`;

	return (
		<SidebarGroup className="h-full">
			<SidebarGroupLabel className="flex items-center gap-2 pb-2 pl-0">
				<Search className="size-4" />
				<span>Search</span>
			</SidebarGroupLabel>
			<SidebarGroupContent className="flex h-full min-h-0 flex-col gap-2">
				<Label className="text-xs font-medium text-muted-foreground" htmlFor="project-search-query">
					Find
				</Label>
				<div className="flex min-w-0 items-center gap-1">
					<Input
						id="project-search-query"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								onSearch(query, caseSensitive);
							}
						}}
						placeholder="Search across all project files…"
						aria-label="Find"
					/>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									size="icon"
									variant={caseSensitive ? "secondary" : "outline"}
									aria-label="Match case"
									aria-pressed={caseSensitive}
									onClick={toggleCaseSensitive}
								>
									<CaseSensitive />
								</Button>
							}
						/>
						<TooltipContent>Match case</TooltipContent>
					</Tooltip>
				</div>
				<Label
					className="text-xs font-medium text-muted-foreground"
					htmlFor="project-search-replacement"
				>
					Replace
				</Label>
				<Input
					id="project-search-replacement"
					value={replacement}
					onChange={(event) => setReplacement(event.target.value)}
					aria-label="Replace"
				/>
				<div className="flex min-w-0 gap-1">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => onSearch(query, caseSensitive)}
						disabled={query.length === 0 || busy}
					>
						{isSearching ? <Loader2 className="animate-spin" /> : <Search />}
						Find
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={() => void onReplaceAll(query, replacement, caseSensitive)}
						disabled={readOnly || query.length === 0 || totalMatches === 0 || busy}
					>
						{isReplacing ? <Loader2 className="animate-spin" /> : <Replace />}
						Replace all
					</Button>
				</div>
				{error ? <p className="text-xs text-destructive">{error}</p> : null}
				<p className="text-xs text-muted-foreground">{summaryText}</p>
				<div className="min-h-0 flex-1 overflow-y-auto pr-1">
					{files.map((fileResult) => {
						const collapsed = collapsedFiles.has(fileResult.fileId);
						return (
							<div key={fileResult.fileId} className="mb-3 min-w-0">
								<div className="mb-1 flex min-w-0 items-center gap-1">
									<button
										type="button"
										onClick={() => toggleFileCollapsed(fileResult.fileId)}
										aria-expanded={!collapsed}
										className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
									>
										{collapsed ? (
											<ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
										) : (
											<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
										)}
										<span className="truncate" title={fileResult.fileId}>
											{fileResult.fileId}
										</span>
										<Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
											{fileResult.matches.length}
										</Badge>
									</button>
									{!readOnly ? (
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														type="button"
														size="icon-xs"
														variant="ghost"
														aria-label={`Replace all in ${fileResult.fileId}`}
														disabled={busy || query.length === 0}
														onClick={() =>
															void onReplaceInFile(
																fileResult.fileId,
																query,
																replacement,
																caseSensitive,
															)
														}
													>
														<Replace />
													</Button>
												}
											/>
											<TooltipContent>Replace all in file</TooltipContent>
										</Tooltip>
									) : null}
								</div>
								{!collapsed ? (
									<div className="grid gap-1">
										{fileResult.matches.map((match) => {
											const segments = getMatchPreviewSegments(match);
											return (
												<div
													key={`${fileResult.fileId}:${match.startOffset}:${match.endOffset}`}
													className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1 rounded-md border border-sidebar-border p-1.5 text-xs transition-colors hover:bg-sidebar-accent/50"
												>
													<button
														type="button"
														onClick={() => onSelectMatch(fileResult.fileId, match)}
														className="min-w-0 text-left focus-visible:outline-none"
													>
														<span className="mb-0.5 block text-[11px] text-muted-foreground">
															Line {match.line}, column {match.column}
														</span>
														<span className="block truncate font-mono">
															{segments.before}
															<mark className="rounded-xs bg-primary/25 px-0.5 text-foreground">
																{segments.match}
															</mark>
															{segments.after}
														</span>
													</button>
													<Tooltip>
														<TooltipTrigger
															render={
																<Button
																	type="button"
																	size="icon-xs"
																	variant="ghost"
																	aria-label="Replace this match"
																	disabled={readOnly || busy}
																	onClick={() =>
																		void onReplaceOne(fileResult.fileId, match, replacement)
																	}
																>
																	<Replace />
																</Button>
															}
														/>
														<TooltipContent>Replace this match</TooltipContent>
													</Tooltip>
												</div>
											);
										})}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
