import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Ellipsis, Layers, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getSlideMoveTarget, type SlideAction, type SlideSection } from "@/lib/slide-blocks";

type SlideOverviewActionsProps = {
	source: string;
	slideCount: number;
	activeIndex: number;
	sections: SlideSection[];
	selected: number[] | null;
	onChangeSelection: (indices: number[] | null) => void;
	onAction: (action: SlideAction) => void;
};

const allSlides = (count: number) => Array.from({ length: count }, (_, index) => index);

export function SlideOverviewActions({
	source,
	slideCount,
	activeIndex,
	sections,
	selected,
	onChangeSelection,
	onAction,
}: SlideOverviewActionsProps) {
	const [menuTarget, setMenuTarget] = useState<{ source: string; activeIndex: number } | null>(
		null,
	);
	const [sectionForm, setSectionForm] = useState<{
		source: string;
		index: number;
		name: string;
		rename: boolean;
	} | null>(null);
	const menuOpen = menuTarget?.source === source && menuTarget.activeIndex === activeIndex;
	if (menuTarget && !menuOpen) {
		setMenuTarget(null);
	}
	const form = sectionForm?.source === source ? sectionForm : null;
	if (sectionForm && !form) {
		setSectionForm(null);
	}
	const sectionIndex = sections.findIndex(({ end }) => activeIndex < end);
	const section = sections[sectionIndex];
	const firstSlideInSection = section?.name && activeIndex === section.start;
	const count = selected?.length ?? 0;
	const indices = selected ?? [activeIndex];
	const moveUp = (indices[0] ?? 0) - 1;
	const moveDown = (indices.at(-1) ?? 0) + 2;

	return (
		<>
			<div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-1">
				{selected ? (
					<>
						<p role="status" className="px-1 text-xs font-medium">
							{count} selected
						</p>
						<Button variant="ghost" onClick={() => onChangeSelection(null)}>
							Done
						</Button>
					</>
				) : (
					<>
						<Button variant="outline" onClick={() => onAction({ type: "add", index: activeIndex })}>
							<Plus data-icon="inline-start" />
							Add slide
						</Button>
						<Button variant="ghost" onClick={() => onChangeSelection([])}>
							<ListChecks data-icon="inline-start" />
							Select
						</Button>
					</>
				)}

				<DropdownMenu
					open={menuOpen}
					onOpenChange={(open) => setMenuTarget(open ? { source, activeIndex } : null)}
				>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								aria-label={selected ? "Selection actions" : "Slide actions"}
							/>
						}
					>
						<Ellipsis />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-44">
						<DropdownMenuGroup>
							<DropdownMenuLabel>
								{selected ? `${count} selected` : `Slide ${activeIndex + 1}`}
							</DropdownMenuLabel>
							{selected ? (
								<DropdownMenuItem
									onClick={() =>
										onChangeSelection(count === slideCount ? [] : allSlides(slideCount))
									}
								>
									<ListChecks />
									{count === slideCount ? "Clear selection" : "Select all slides"}
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									onClick={() => onAction({ type: "duplicate", index: activeIndex })}
								>
									<Copy /> Duplicate slide
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								disabled={getSlideMoveTarget(slideCount, indices, moveUp) === null}
								onClick={() => onAction({ type: "move", indices, slot: moveUp })}
							>
								<ArrowUp /> Move up
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={getSlideMoveTarget(slideCount, indices, moveDown) === null}
								onClick={() => onAction({ type: "move", indices, slot: moveDown })}
							>
								<ArrowDown /> Move down
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								disabled={!indices.length}
								onClick={() => onAction({ type: "delete", indices })}
							>
								<Trash2 /> {selected ? "Delete selected slides" : "Delete slide"}
							</DropdownMenuItem>
							{!selected && !firstSlideInSection && (
								<DropdownMenuItem
									onClick={() =>
										setSectionForm({ source, index: activeIndex, name: "", rename: false })
									}
								>
									<Layers /> Start section here
								</DropdownMenuItem>
							)}
						</DropdownMenuGroup>
						{!selected && section?.name && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuLabel className="truncate">{section.name}</DropdownMenuLabel>
									<DropdownMenuItem
										onClick={() =>
											setSectionForm({
												source,
												index: section.start,
												name: section.name ?? "",
												rename: true,
											})
										}
									>
										Rename section
									</DropdownMenuItem>
									<DropdownMenuItem
										disabled={!sections[sectionIndex - 1]?.name}
										onClick={() => onAction({ type: "move-section-up", index: section.start })}
									>
										<ArrowUp /> Move section up
									</DropdownMenuItem>
									<DropdownMenuItem
										disabled={!sections[sectionIndex + 1]?.name}
										onClick={() => onAction({ type: "move-section-down", index: section.start })}
									>
										<ArrowDown /> Move section down
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => onAction({ type: "remove-section", index: section.start })}
									>
										Remove section
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<Dialog
				open={form !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSectionForm(null);
					}
				}}
			>
				{form && (
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{form.rename ? "Rename section" : "Start a section"}</DialogTitle>
						</DialogHeader>
						<form
							className="flex flex-col gap-4"
							onSubmit={(event) => {
								event.preventDefault();
								if (!form.name.trim()) {
									return;
								}
								onAction({ type: "name-section", index: form.index, name: form.name });
								setSectionForm(null);
							}}
						>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="slide-section-name">Section name</FieldLabel>
									<Input
										id="slide-section-name"
										value={form.name}
										maxLength={100}
										onChange={(event) => setSectionForm({ ...form, name: event.target.value })}
										required
									/>
								</Field>
							</FieldGroup>
							<DialogFooter>
								<DialogClose render={<Button type="button" variant="outline" />}>
									Cancel
								</DialogClose>
								<Button type="submit" disabled={!form.name.trim()}>
									{form.rename ? "Save name" : "Create section"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				)}
			</Dialog>
		</>
	);
}
