import { useState } from "react";
import { cn } from "@/lib/utils";

type PaneResizeHandleProps = {
	label: string;
	onResize: (clientX: number) => void;
	/** Keyboard resize; delta is in pixels along the x-axis (positive = right). */
	onNudge: (delta: number) => void;
	onReset: () => void;
	onResizingChange?: (resizing: boolean) => void;
	disabled?: boolean;
};

const NUDGE_STEP = 16;

/**
 * Draggable divider between panes. Rendered inside a zero-width grid track so
 * it doesn't shift the layout; the interactive area overlaps the neighboring
 * panes by a few pixels on each side.
 */
export const PaneResizeHandle = ({
	label,
	onResize,
	onNudge,
	onReset,
	onResizingChange,
	disabled = false,
}: PaneResizeHandleProps) => {
	const [isDragging, setIsDragging] = useState(false);

	const setDragging = (dragging: boolean) => {
		setIsDragging(dragging);
		onResizingChange?.(dragging);
		// Keep the resize cursor (and suppress text selection) while the
		// pointer travels over other panes during the drag.
		document.body.style.cursor = dragging ? "col-resize" : "";
		document.body.style.userSelect = dragging ? "none" : "";
	};

	return (
		<div className="relative hidden xl:block">
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label={label}
				tabIndex={disabled ? -1 : 0}
				data-dragging={isDragging || undefined}
				className={cn(
					"absolute inset-y-0 left-1/2 z-20 w-2 -translate-x-1/2 touch-none",
					"after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors",
					disabled
						? "pointer-events-none"
						: "cursor-col-resize hover:after:bg-primary/50 focus-visible:outline-none focus-visible:after:bg-primary data-dragging:after:bg-primary",
				)}
				onPointerDown={(event) => {
					if (disabled || event.button !== 0) {
						return;
					}

					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					setDragging(true);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) {
						onResize(event.clientX);
					}
				}}
				onPointerUp={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) {
						event.currentTarget.releasePointerCapture(event.pointerId);
					}
					setDragging(false);
				}}
				onPointerCancel={() => {
					setDragging(false);
				}}
				onDoubleClick={onReset}
				onKeyDown={(event) => {
					if (event.key === "ArrowLeft") {
						event.preventDefault();
						onNudge(-NUDGE_STEP);
					} else if (event.key === "ArrowRight") {
						event.preventDefault();
						onNudge(NUDGE_STEP);
					}
				}}
			/>
		</div>
	);
};
