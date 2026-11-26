import { Autocomplete } from "@base-ui/react/autocomplete";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/config";
import { fetcher } from "@/lib/fetcher";

type Candidate = {
	name: string;
	email: string;
};

type SearchResult = {
	query: string;
	candidates: Candidate[];
	failed?: boolean;
};

export function CollaboratorPicker({
	projectId,
	value,
	onValueChange,
	disabled,
	searchEnabled,
}: {
	projectId: string;
	value: string;
	onValueChange: (value: string) => void;
	disabled: boolean;
	searchEnabled: boolean;
}) {
	const [popupRequested, setPopupRequested] = useState(false);
	const [result, setResult] = useState<SearchResult | null>(null);
	const query = value.trim();
	const open = popupRequested && searchEnabled && !disabled && query.length >= 2;
	const currentResult = result?.query === query ? result : null;
	const candidates = currentResult?.candidates ?? [];

	useEffect(() => {
		if (!open) {
			return;
		}

		const controller = new AbortController();
		async function search() {
			const params = new URLSearchParams({ q: query });
			let nextResult: SearchResult;
			try {
				const candidates = await fetcher<Candidate[]>(
					`${API_URL}/projects/${projectId}/collaborators/candidates?${params}`,
					{ signal: controller.signal },
				);
				nextResult = { query, candidates };
			} catch {
				nextResult = { query, candidates: [], failed: true };
			}
			if (!controller.signal.aborted) {
				setResult(nextResult);
			}
		}
		const timer = window.setTimeout(() => {
			void search();
		}, 200);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [open, projectId, query]);

	let status: string | undefined;
	if (!currentResult) {
		status = "Searching…";
	} else if (currentResult.failed) {
		status = "Couldn’t search for people. Try again or enter an email.";
	} else if (candidates.length === 0) {
		status = "No matching people";
	}

	return (
		<Autocomplete.Root
			items={candidates}
			filter={null}
			itemToStringValue={(candidate) => candidate.email}
			openOnInputClick
			open={open}
			onOpenChange={(next) => {
				setPopupRequested(next);
				if (!next) {
					setResult(null);
				}
			}}
			value={value}
			onValueChange={(next) => {
				if (next.trim() !== query) {
					setResult(null);
				}
				onValueChange(next);
			}}
			disabled={disabled}
		>
			<Autocomplete.Input
				aria-label="Search by name or email"
				placeholder="Search by name or email"
				name="collaborator"
				maxLength={254}
				render={<Input />}
			/>
			<Autocomplete.Portal>
				<Autocomplete.Positioner sideOffset={4} align="start" className="isolate z-50">
					<Autocomplete.Popup className="w-(--anchor-width) max-h-(--available-height) min-w-52 max-w-(--available-width) overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
						<Autocomplete.Status className="sr-only">
							{candidates.length > 0 ? `${candidates.length} matching accounts` : null}
						</Autocomplete.Status>
						<Autocomplete.Empty>
							{status ? <p className="px-3 py-2 text-xs text-muted-foreground">{status}</p> : null}
						</Autocomplete.Empty>
						<Autocomplete.List className="p-1 empty:hidden">
							{(candidate: Candidate) => (
								<Autocomplete.Item
									key={candidate.email}
									value={candidate}
									className="flex cursor-default flex-col rounded-md px-2 py-1.5 text-xs select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
								>
									<span className="truncate font-medium">{candidate.name}</span>
									<span className="truncate text-muted-foreground">{candidate.email}</span>
								</Autocomplete.Item>
							)}
						</Autocomplete.List>
					</Autocomplete.Popup>
				</Autocomplete.Positioner>
			</Autocomplete.Portal>
		</Autocomplete.Root>
	);
}
