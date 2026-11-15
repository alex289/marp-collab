import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightIcon, PresentationIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/components/presentation-timer";

type DemoControlsProps = {
	/** Body of the Picture-in-Picture window the controls are rendered into. */
	container: HTMLElement;
	title: string | null;
	speakerNotes: readonly string[];
	slideLabel: string;
	hasNextSlide: boolean;
	onEnd: (options: { advance: boolean }) => void;
};

/**
 * Floating presenter controls shown on top of other apps while a live demo
 * runs, so the presenter keeps their notes and can jump back into the deck.
 */
export function DemoControls({
	container,
	title,
	speakerNotes,
	slideLabel,
	hasNextSlide,
	onEnd,
}: DemoControlsProps) {
	const [startedAt] = useState(() => Date.now());
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = window.setInterval(() => setNow(Date.now()), 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, []);

	return createPortal(
		<div className="flex h-svh flex-col gap-3 bg-background p-4 text-foreground">
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					<span className="size-2 animate-pulse rounded-full bg-red-500" aria-hidden />
					Live demo
				</span>
				<span className="font-mono text-sm tabular-nums">{formatElapsed(now - startedAt)}</span>
			</div>
			<div className="min-w-0">
				<p className="truncate text-lg font-semibold tracking-tight">{title || "Demo"}</p>
				<p className="text-xs text-muted-foreground">{slideLabel}</p>
			</div>
			{speakerNotes.length > 0 && (
				<div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border px-3 py-2 text-sm leading-6">
					{speakerNotes.map((comment, index) => (
						<p className="whitespace-pre-wrap" key={`${index}-${comment}`}>
							{comment}
						</p>
					))}
				</div>
			)}
			<div className="mt-auto flex flex-col gap-2">
				<Button type="button" onClick={() => onEnd({ advance: false })}>
					<PresentationIcon />
					Back to presentation
				</Button>
				{hasNextSlide && (
					<Button type="button" variant="secondary" onClick={() => onEnd({ advance: true })}>
						Back and next slide
						<ArrowRightIcon />
					</Button>
				)}
			</div>
		</div>,
		container,
	);
}
