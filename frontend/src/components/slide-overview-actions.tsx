import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowUp, Copy, Layers, ListChecks, Plus, Trash2, X } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSlideMoveTarget, type SlideAction, type SlideSection } from "@/lib/slide-blocks";

export type ThumbnailMenu = {
	index: number;
	x: number;
	y: number;
	keyboard: boolean;
	open: boolean;
};

type SlideOverviewActionsProps = {
	slideKey: (index: number) => string;
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

function ToolbarButton({
	label,
	onClick,
	disabled,
	destructive,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	destructive?: boolean;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant={destructive ? "destructive" : "ghost"}
						size="icon-sm"
						aria-label={label}
						disabled={disabled}
						onClick={onClick}
					>
						{children}
					</Button>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

const allSlides = (count: number) => Array.from({ length: count }, (_, index) => index);

export function SlideOverviewActions({
	slideKey,
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
	const [sectionForm, setSectionForm] = useState<{
		key: string;
		index: number;
		name: string;
		rename: boolean;
	} | null>(null);
	const form = sectionForm && sectionForm.key === slideKey(sectionForm.index) ? sectionForm : null;
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

	const moveTargets = (indices: number[]) => ({
		up: (indices[0] ?? 0) - 1,
		down: (indices.at(-1) ?? 0) + 2,
	});

	const selectionMove = moveTargets(selected ?? []);

	function contextMenuItems(index: number, selection: number[] | null) {
		const sectionIndex = sections.findIndex(({ end }) => index < end);
		const section = sections[sectionIndex];
		const firstSlideInSection = section?.name && index === section.start;
		const count = selection?.length ?? 0;
		const indices = selection ?? [index];
		const { up: moveUp, down: moveDown } = moveTargets(indices);
		return (
			<>
				<ContextMenuGroup>
					<ContextMenuLabel>
						{selection ? `${count} selected` : `Slide ${index + 1}`}
					</ContextMenuLabel>
					{!selection && (
						<ContextMenuItem onClick={() => onAction({ type: "add", index })}>
							<Plus /> Add slide after
						</ContextMenuItem>
					)}
					{selection ? (
						<ContextMenuItem
							onClick={() => onChangeSelection(count === slideCount ? [] : allSlides(slideCount))}
						>
							<ListChecks />
							{count === slideCount ? "Clear selection" : "Select all slides"}
						</ContextMenuItem>
					) : (
						<ContextMenuItem onClick={() => onAction({ type: "duplicate", index })}>
							<Copy /> Duplicate slide
						</ContextMenuItem>
					)}
					<ContextMenuItem
						disabled={getSlideMoveTarget(slideCount, indices, moveUp) === null}
						onClick={() => onAction({ type: "move", indices, slot: moveUp })}
					>
						<ArrowUp /> Move up
					</ContextMenuItem>
					<ContextMenuItem
						disabled={getSlideMoveTarget(slideCount, indices, moveDown) === null}
						onClick={() => onAction({ type: "move", indices, slot: moveDown })}
					>
						<ArrowDown /> Move down
					</ContextMenuItem>
					<ContextMenuItem
						variant="destructive"
						disabled={!indices.length}
						onClick={() => onAction({ type: "delete", indices })}
					>
						<Trash2 /> {selection ? "Delete selected slides" : "Delete slide"}
					</ContextMenuItem>
					{!selection && !firstSlideInSection && (
						<ContextMenuItem
							onClick={() =>
								setSectionForm({ key: slideKey(index), index, name: "", rename: false })
							}
						>
							<Layers /> Start section here
						</ContextMenuItem>
					)}
				</ContextMenuGroup>
				{!selection && section?.name && (
					<>
						<ContextMenuSeparator />
						<ContextMenuGroup>
							<ContextMenuLabel className="truncate">{section.name}</ContextMenuLabel>
							<ContextMenuItem
								onClick={() =>
									setSectionForm({
										key: slideKey(section.start),
										index: section.start,
										name: section.name ?? "",
										rename: true,
									})
								}
							>
								Rename section
							</ContextMenuItem>
							<ContextMenuItem
								disabled={!sections[sectionIndex - 1]?.name}
								onClick={() => onAction({ type: "move-section-up", index: section.start })}
							>
								<ArrowUp /> Move section up
							</ContextMenuItem>
							<ContextMenuItem
								disabled={!sections[sectionIndex + 1]?.name}
								onClick={() => onAction({ type: "move-section-down", index: section.start })}
							>
								<ArrowDown /> Move section down
							</ContextMenuItem>
							<ContextMenuItem
								onClick={() => onAction({ type: "remove-section", index: section.start })}
							>
								Remove section
							</ContextMenuItem>
						</ContextMenuGroup>
					</>
				)}
			</>
		);
	}

	return (
		<>
			{selected ? (
				<div className="flex min-w-0 flex-1 items-center gap-0.5">
					<ToolbarButton label="Done selecting" onClick={() => onChangeSelection(null)}>
						<X />
					</ToolbarButton>
					<p role="status" className="mr-auto truncate pl-1 font-medium text-sidebar-foreground">
						{selected.length} selected
					</p>
					<ToolbarButton
						label="Move selected up"
						disabled={getSlideMoveTarget(slideCount, selected, selectionMove.up) === null}
						onClick={() => onAction({ type: "move", indices: selected, slot: selectionMove.up })}
					>
						<ArrowUp />
					</ToolbarButton>
					<ToolbarButton
						label="Move selected down"
						disabled={getSlideMoveTarget(slideCount, selected, selectionMove.down) === null}
						onClick={() => onAction({ type: "move", indices: selected, slot: selectionMove.down })}
					>
						<ArrowDown />
					</ToolbarButton>
					<ToolbarButton
						label="Delete selected"
						destructive
						disabled={!selected.length}
						onClick={() => onAction({ type: "delete", indices: selected })}
					>
						<Trash2 />
					</ToolbarButton>
				</div>
			) : (
				<div className="ml-auto flex shrink-0 items-center gap-0.5">
					<ToolbarButton
						label="Add slide"
						onClick={() => onAction({ type: "add", index: activeIndex })}
					>
						<Plus />
					</ToolbarButton>
					<ToolbarButton label="Select slides" onClick={() => onChangeSelection([])}>
						<ListChecks />
					</ToolbarButton>
				</div>
			)}
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
					{thumbnailMenu && contextMenuItems(thumbnailMenu.index, selectionAtThumbnail)}
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
