import { useMemo, useRef, useState, type RefObject } from "react";
import { ArrowDown, ArrowUp, Copy, Ellipsis, Layers, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
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

export type ThumbnailMenu = {
	index: number;
	x: number;
	y: number;
	keyboard: boolean;
	open: boolean;
};

type SlideOverviewActionsProps = {
	source: string;
	slideCount: number;
	activeIndex: number;
	sections: SlideSection[];
	selected: number[] | null;
	thumbnailMenu: ThumbnailMenu | null;
	iframeRef: RefObject<HTMLIFrameElement | null>;
	onCloseThumbnailMenu: () => void;
	onFocusThumbnail: (index: number) => void;
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
	thumbnailMenu,
	iframeRef,
	onCloseThumbnailMenu,
	onFocusThumbnail,
	onChangeSelection,
	onAction,
}: SlideOverviewActionsProps) {
	const restoreThumbnailFocus = useRef(false);
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
	const anchor = useMemo(
		() =>
			thumbnailMenu && {
				getBoundingClientRect: () => new DOMRect(thumbnailMenu.x, thumbnailMenu.y, 0, 0),
			},
		[thumbnailMenu],
	);
	const selectionAtThumbnail =
		thumbnailMenu && selected?.includes(thumbnailMenu.index) ? selected : null;

	function menuItems(index: number, selection: number[] | null, context = false) {
		const Group = context ? ContextMenuGroup : DropdownMenuGroup;
		const Label = context ? ContextMenuLabel : DropdownMenuLabel;
		const Item = context ? ContextMenuItem : DropdownMenuItem;
		const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;
		const sectionIndex = sections.findIndex(({ end }) => index < end);
		const section = sections[sectionIndex];
		const firstSlideInSection = section?.name && index === section.start;
		const count = selection?.length ?? 0;
		const indices = selection ?? [index];
		const moveUp = (indices[0] ?? 0) - 1;
		const moveDown = (indices.at(-1) ?? 0) + 2;
		return (
			<>
				<Group>
					<Label>{selection ? `${count} selected` : `Slide ${index + 1}`}</Label>
					{context && !selection && (
						<Item onClick={() => onAction({ type: "add", index })}>
							<Plus /> Add slide after
						</Item>
					)}
					{selection ? (
						<Item
							onClick={() => onChangeSelection(count === slideCount ? [] : allSlides(slideCount))}
						>
							<ListChecks />
							{count === slideCount ? "Clear selection" : "Select all slides"}
						</Item>
					) : (
						<Item onClick={() => onAction({ type: "duplicate", index })}>
							<Copy /> Duplicate slide
						</Item>
					)}
					<Item
						disabled={getSlideMoveTarget(slideCount, indices, moveUp) === null}
						onClick={() => onAction({ type: "move", indices, slot: moveUp })}
					>
						<ArrowUp /> Move up
					</Item>
					<Item
						disabled={getSlideMoveTarget(slideCount, indices, moveDown) === null}
						onClick={() => onAction({ type: "move", indices, slot: moveDown })}
					>
						<ArrowDown /> Move down
					</Item>
					<Item
						variant="destructive"
						disabled={!indices.length}
						onClick={() => onAction({ type: "delete", indices })}
					>
						<Trash2 /> {selection ? "Delete selected slides" : "Delete slide"}
					</Item>
					{!selection && !firstSlideInSection && (
						<Item onClick={() => setSectionForm({ source, index, name: "", rename: false })}>
							<Layers /> Start section here
						</Item>
					)}
				</Group>
				{!selection && section?.name && (
					<>
						<Separator />
						<Group>
							<Label className="truncate">{section.name}</Label>
							<Item
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
							</Item>
							<Item
								disabled={!sections[sectionIndex - 1]?.name}
								onClick={() => onAction({ type: "move-section-up", index: section.start })}
							>
								<ArrowUp /> Move section up
							</Item>
							<Item
								disabled={!sections[sectionIndex + 1]?.name}
								onClick={() => onAction({ type: "move-section-down", index: section.start })}
							>
								<ArrowDown /> Move section down
							</Item>
							<Item onClick={() => onAction({ type: "remove-section", index: section.start })}>
								Remove section
							</Item>
						</Group>
					</>
				)}
			</>
		);
	}

	return (
		<>
			<div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-1">
				{selected ? (
					<>
						<p role="status" className="px-1 text-xs font-medium">
							{selected.length} selected
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
						{menuItems(activeIndex, selected)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<ContextMenu
				open={thumbnailMenu?.open ?? false}
				onOpenChange={(open, details) => {
					if (!open) {
						restoreThumbnailFocus.current =
							thumbnailMenu?.keyboard === true && details.reason === "escape-key";
						onCloseThumbnailMenu();
					}
				}}
			>
				<ContextMenuContent
					anchor={anchor}
					aria-label={selectionAtThumbnail ? "Selection actions" : "Slide actions"}
					className="min-w-44"
					finalFocus={() => {
						if (thumbnailMenu && restoreThumbnailFocus.current) {
							restoreThumbnailFocus.current = false;
							onFocusThumbnail(thumbnailMenu.index);
							return iframeRef.current;
						}
						return true;
					}}
				>
					{thumbnailMenu && menuItems(thumbnailMenu.index, selectionAtThumbnail, true)}
				</ContextMenuContent>
			</ContextMenu>
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
