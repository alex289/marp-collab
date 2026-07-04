import { useEffect, type RefObject } from "react";

// Marp preview/presentation content renders inside a sandboxed iframe, which is a
// separate browsing context: keydown events fired while it has focus never reach the
// parent document, so app-wide hotkeys (useHotkeys, which listens on `document`) go
// silent as soon as the user clicks into the iframe. This forwards keydown events back
// to the parent, which replays them on `document` so the hotkey manager sees them.
export const IFRAME_KEYDOWN_FORWARDING_SCRIPT = `
    window.addEventListener('keydown', function (e) {
      window.parent.postMessage({
        type: 'forwarded-keydown',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
      }, window.location.origin);
    });
`;

export function useForwardedIframeKeydown(iframeRef: RefObject<HTMLIFrameElement | null>) {
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== iframeRef.current?.contentWindow) {
				return;
			}

			const data = event.data;
			if (!data || data.type !== "forwarded-keydown" || typeof data.key !== "string") {
				return;
			}

			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: data.key,
					code: data.code,
					ctrlKey: data.ctrlKey,
					shiftKey: data.shiftKey,
					altKey: data.altKey,
					metaKey: data.metaKey,
					repeat: data.repeat,
					bubbles: true,
					cancelable: true,
				}),
			);
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [iframeRef]);
}
