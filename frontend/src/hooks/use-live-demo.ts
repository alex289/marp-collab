import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openDemoWindow, supportsDemoWindow } from "@/lib/demo-window";
import {
	hasDemoAudience,
	publishDemoShare,
	registerDemoPresenter,
	stopDemoStream,
} from "@/lib/demo-share";

export function useLiveDemo(deck: string | null, mode: "present" | "viewer" | undefined) {
	const isPresentation = mode !== undefined;
	const isViewer = mode === "viewer";
	const presenterDemoDeck = mode === "present" ? deck : null;
	const [isDemo, setIsDemo] = useState(false);
	const hasChangedDemoRef = useRef(false);
	const [isSharingDemo, setIsSharingDemo] = useState(false);
	// React dev tooling inspects props. Passing the PiP window would expose cross-origin frames.
	const [demoContainer, setDemoContainer] = useState<HTMLElement | null>(null);
	const demoWindowRef = useRef<Window | null>(null);
	const stopDemoShareRef = useRef<(() => void) | null>(null);
	const demoCapturePendingRef = useRef(false);
	// A pending picker or floating window may resolve after leaving the deck.
	const demoRequestRef = useRef(0);
	const closeDemoOutput = useCallback(() => {
		demoRequestRef.current += 1;
		stopDemoShareRef.current?.();
		stopDemoShareRef.current = null;
		const current = demoWindowRef.current;
		demoWindowRef.current = null;
		current?.close();
	}, []);
	const stopDemo = useCallback(() => {
		closeDemoOutput();
		setIsDemo(false);
	}, [closeDemoOutput]);
	const slideHasSpeakerNotesRef = useRef(false);
	const handleHasSpeakerNotesChange = useCallback((hasSpeakerNotes: boolean) => {
		slideHasSpeakerNotesRef.current = hasSpeakerNotes;
	}, []);

	const [previousDemoDeck, setPreviousDemoDeck] = useState(presenterDemoDeck);
	if (previousDemoDeck !== presenterDemoDeck) {
		setPreviousDemoDeck(presenterDemoDeck);
		setIsDemo(false);
	}
	if (!isDemo && isSharingDemo) {
		setIsSharingDemo(false);
	}
	if (!isDemo && demoContainer) {
		setDemoContainer(null);
	}

	useEffect(() => {
		if (!isDemo) {
			closeDemoOutput();
		}
	}, [isDemo, closeDemoOutput]);

	useEffect(() => {
		if (!isPresentation) {
			return;
		}

		const unregisterPresenter = presenterDemoDeck
			? registerDemoPresenter(presenterDemoDeck, () => {
					hasChangedDemoRef.current = true;
					stopDemo();
				})
			: undefined;
		if (!isViewer) {
			window.addEventListener("pagehide", stopDemo);
		}
		return () => {
			hasChangedDemoRef.current = false;
			unregisterPresenter?.();
			window.removeEventListener("pagehide", stopDemo);
			closeDemoOutput();
		};
	}, [isPresentation, isViewer, deck, presenterDemoDeck, closeDemoOutput, stopDemo]);

	const startDemo = useCallback(async () => {
		if (demoCapturePendingRef.current) {
			return;
		}
		const request = ++demoRequestRef.current;
		if (
			presenterDemoDeck &&
			hasDemoAudience(presenterDemoDeck) &&
			navigator.mediaDevices?.getDisplayMedia
		) {
			demoCapturePendingRef.current = true;
			let stream: MediaStream;
			try {
				const options = {
					video: true,
					audio: false,
					selfBrowserSurface: "exclude",
					monitorTypeSurfaces: "exclude",
				} as const;
				stream = await navigator.mediaDevices.getDisplayMedia(options);
			} catch (error) {
				if (
					request === demoRequestRef.current &&
					!(error instanceof DOMException && error.name === "NotAllowedError")
				) {
					toast.error("Could not share the demo. Try choosing the tab or window again.");
				}
				return;
			} finally {
				demoCapturePendingRef.current = false;
			}

			if (request !== demoRequestRef.current) {
				stopDemoStream(stream);
				return;
			}
			const stop = publishDemoShare(presenterDemoDeck, stream, stopDemo);
			if (!stop) {
				toast.info("Demo sharing ended before it reached the audience window.");
				return;
			}
			stopDemoShareRef.current = stop;
			hasChangedDemoRef.current = true;
			setIsSharingDemo(true);
			setIsDemo(true);
			return;
		}

		hasChangedDemoRef.current = true;
		setIsDemo(true);
		const opened = await openDemoWindow({ compact: !slideHasSpeakerNotesRef.current });
		if (request !== demoRequestRef.current) {
			opened?.close();
			return;
		}
		if (!opened) {
			if (!supportsDemoWindow()) {
				toast.info("Floating demo controls need Chrome or Edge. Press L to end the demo.");
			}
			return;
		}

		demoWindowRef.current = opened;
		setDemoContainer(opened.document.body);
		// Closing the floating controls ends the live demo.
		opened.addEventListener(
			"pagehide",
			() => {
				if (demoWindowRef.current !== opened) {
					return;
				}
				demoWindowRef.current = null;
				setIsDemo(false);
			},
			{ once: true },
		);
	}, [presenterDemoDeck, stopDemo]);

	const endLocalDemo = useCallback(() => {
		hasChangedDemoRef.current = true;
		if (demoWindowRef.current) {
			window.focus();
		}
		stopDemo();
	}, [stopDemo]);

	return {
		presenterDemoDeck,
		isDemo,
		setIsDemo,
		isSharingDemo,
		demoContainer,
		hasChangedDemoRef,
		handleHasSpeakerNotesChange,
		startDemo,
		endLocalDemo,
	};
}
