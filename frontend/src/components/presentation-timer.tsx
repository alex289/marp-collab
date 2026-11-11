import { useEffect, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatElapsed(ms: number) {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Elapsed presentation time. Starts when mounted, i.e. when presentation mode is entered. */
export function PresentationTimer() {
	const [startedAt, setStartedAt] = useState(() => Date.now());
	const [now, setNow] = useState(() => Date.now());
	const [isPaused, setIsPaused] = useState(false);
	const [pausedElapsedMs, setPausedElapsedMs] = useState(0);

	useEffect(() => {
		if (isPaused) {
			return;
		}

		const interval = window.setInterval(() => setNow(Date.now()), 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, [isPaused]);

	const elapsedMs = isPaused ? pausedElapsedMs : now - startedAt;
	const resetTimer = () => {
		const currentTime = Date.now();
		setStartedAt(currentTime);
		setNow(currentTime);
		setPausedElapsedMs(0);
		setIsPaused(false);
	};
	const pauseTimer = () => {
		const currentTime = Date.now();
		setNow(currentTime);
		setPausedElapsedMs(Math.max(0, currentTime - startedAt));
		setIsPaused(true);
	};
	const resumeTimer = () => {
		const currentTime = Date.now();
		setStartedAt(currentTime - pausedElapsedMs);
		setNow(currentTime);
		setIsPaused(false);
	};

	return (
		<ButtonGroup>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							type="button"
							variant="secondary"
							aria-label={isPaused ? "Resume timer" : "Pause timer"}
							onClick={isPaused ? resumeTimer : pauseTimer}
						>
							{isPaused ? <PlayIcon /> : <PauseIcon />}
						</Button>
					}
				/>
				<TooltipContent>{isPaused ? "Resume timer" : "Pause timer"}</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button type="button" variant="secondary" aria-label="Reset timer" onClick={resetTimer}>
							{formatElapsed(elapsedMs)}
						</Button>
					}
				/>
				<TooltipContent>Reset timer</TooltipContent>
			</Tooltip>
		</ButtonGroup>
	);
}
