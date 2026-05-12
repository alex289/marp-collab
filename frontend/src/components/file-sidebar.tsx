import { FileCode2, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DeckFile } from "@/lib/types";

type FileSidebarProps = {
	files: DeckFile[];
	selectedFileId: string | null;
	onSelectFile: (file: DeckFile) => void;
	isLoading: boolean;
	error: string | null;
	onRetry: () => void;
};

export const FileSidebar = ({
	files,
	selectedFileId,
	onSelectFile,
	isLoading,
	error,
	onRetry,
}: FileSidebarProps) => {
	return (
		<aside className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card/80 backdrop-blur">
			<header className="px-4 py-3">
				<p className="text-sm font-semibold tracking-wide">Projektdateien</p>
				<p className="text-xs text-muted-foreground">Marp Deck in Echtzeit</p>
			</header>

			<Separator />

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-1 p-2">
					{isLoading ? (
						<p className="px-2 py-3 text-xs text-muted-foreground">Lade Dateien...</p>
					) : null}

					{error ? (
						<div className="rounded-md border border-rose-300/70 bg-rose-100/60 p-2 text-xs text-rose-700">
							<p className="mb-2">{error}</p>
							<Button size="sm" variant="outline" onClick={onRetry}>
								<RefreshCw className="mr-1 h-3 w-3" />
								Erneut laden
							</Button>
						</div>
					) : null}

					{!isLoading && !error
						? files.map((file) => (
								<button
									key={file.id}
									className={cn(
										"flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition",
										selectedFileId === file.id
											? "bg-primary text-primary-foreground"
											: "hover:bg-accent hover:text-accent-foreground",
									)}
									onClick={() => onSelectFile(file)}
								>
									<FileCode2 className="h-4 w-4" />
									<span className="truncate">{file.label}</span>
								</button>
							))
						: null}
				</div>
			</ScrollArea>
		</aside>
	);
};
