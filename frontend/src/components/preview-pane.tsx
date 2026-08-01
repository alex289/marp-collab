import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { renderMarp } from "@/lib/marp";
import { useTheme } from "./theme-provider";
import marpitSvgPolyfillScript from "@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw";
import { toast } from "sonner";

type PreviewPaneProps = {
	markdown: string;
	label: string | null;
	projectId: string;
	selectedFileId: string | null;
	themeRevision: number;
	assetRevision: number;
	assetToken?: string;
	// The slide index the editor cursor is currently on, or null when the
	// editor isn't editing the previewed file. Scrolling to this slide is
	// purely local UI state — it's never broadcast to other collaborators.
	followSlideIndex: number | null;
	// Called with the 0-based slide index when the user double-clicks a slide
	// in the preview, so the caller can jump the editor to that position.
	onSlideDoubleClick?: (index: number) => void;
};

// srcDoc never changes so the iframe never reloads.
// Content is pushed in via postMessage to preserve scroll position.
const staticSrcDoc = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style id="marp-styles"></style>
    <script>
      ${marpitSvgPolyfillScript}
    </script>
    <script>
      var zoom = 1;
      var MIN_ZOOM = 0.5;
      var MAX_ZOOM = 4;
      var lastNotifiedZoom = null;

      function applyZoom() {
        var el = document.querySelector('div.marpit');
        if (el) el.style.transform = 'scale(' + zoom + ')';
        // marp-update calls this on every content push (each keystroke);
        // only message the parent when the zoom value actually changed.
        if (zoom !== lastNotifiedZoom) {
          lastNotifiedZoom = zoom;
          if (port) {
            port.postMessage({ type: 'marp-zoom-changed', zoom: zoom });
          }
        }
      }

      function resetZoom() {
        zoom = 1;
        var el = document.querySelector('div.marpit');
        if (el) el.style.transformOrigin = '';
        applyZoom();
        window.scrollTo(0, 0);
      }

      function scrollToSlide(index) {
        var slides = document.querySelectorAll('div.marpit > svg[data-marpit-svg], body > section');
        var target = slides[index];
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      window.addEventListener('wheel', function (e) {
        if (!e.ctrlKey) return;
        e.preventDefault();

        var el = document.querySelector('div.marpit');
        if (el) {
          var rect = el.getBoundingClientRect();
          var originX = ((e.clientX - rect.left) / rect.width) * 100;
          var originY = ((e.clientY - rect.top) / rect.height) * 100;
          el.style.transformOrigin = originX + '% ' + originY + '%';
        }

        var delta = -e.deltaY * 0.005;
        zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
        applyZoom();
      }, { passive: false });

      function slideIndexFromTarget(target) {
        var slides = document.querySelectorAll('div.marpit > svg[data-marpit-svg], body > section');
        for (var i = 0; i < slides.length; i++) {
          if (slides[i] === target || slides[i].contains(target)) return i;
        }
        return -1;
      }

      window.addEventListener('dblclick', function (e) {
        if (zoom !== 1) {
          e.preventDefault();
          resetZoom();
          return;
        }
        var index = slideIndexFromTarget(e.target);
        if (index === -1) return;
        if (port) {
          port.postMessage({ type: 'marp-slide-doubleclick', index: index });
        }
      });

      // Keydown/keyup inside the iframe don't bubble to the parent document, so
      // page-level hotkeys (theme toggle, focus mode, etc.) would stop working once
      // the iframe has focus. Forward raw key events to the parent, which re-dispatches
      // them on its own document.
      function forwardKey(type) {
        return function (e) {
          if (!port) {
            return;
          }
          port.postMessage({
            type: 'presentation-key',
            eventType: type,
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
          });
        };
      }

      window.addEventListener('keydown', forwardKey('keydown'));
      window.addEventListener('keyup', forwardKey('keyup'));

      // Set once the parent hands over a MessagePort (see 'init-port' below).
      var port = null;
      var lastHtml = null;
      var lastCss = null;

      function handlePortMessage(e) {
        if (!e.data) return;
        if (e.data.type === 'marp-zoom') {
          if (e.data.action === 'reset') {
            resetZoom();
            return;
          }
          var factor = e.data.action === 'in' ? 1.2 : 1 / 1.2;
          zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
          applyZoom();
          return;
        }
        if (e.data.type === 'marp-scroll-to-slide') {
          scrollToSlide(e.data.index);
          return;
        }
        if (e.data.type !== 'marp-update') return;
        // Rebuilding the body recreates every image element, so skip pushes that
        // would paint exactly what is already on screen.
        if (!e.data.scrollToTop && e.data.html === lastHtml && e.data.css === lastCss) return;
        lastHtml = e.data.html;
        lastCss = e.data.css;
        document.getElementById('marp-styles').textContent = e.data.css;
        document.body.innerHTML = e.data.html;
        if (e.data.scrollToTop) {
          window.scrollTo(0, 0);
          zoom = 1;
        }
        applyZoom();
      }

      window.addEventListener('message', function (e) {
        if (e.source !== window.parent) return;
        if (e.data && e.data.type === 'init-port' && e.ports && e.ports[0]) {
          port = e.ports[0];
          port.onmessage = handlePortMessage;
        }
      });
    </script>
  </head>
  <body></body>
</html>`;

export const PreviewPane = ({
	markdown,
	label,
	projectId,
	selectedFileId,
	themeRevision,
	assetRevision,
	assetToken,
	followSlideIndex,
	onSlideDoubleClick,
}: PreviewPaneProps) => {
	const { resolvedTheme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	// MessagePort to the iframe, set on load instead of using broadcast
	// postMessage(..., "*") so a navigated-away frame can't keep receiving messages.
	const portRef = useRef<MessagePort | null>(null);
	const [iframeReady, setIframeReady] = useState(false);
	const prevFileKeyRef = useRef<string | null>(null);
	const [zoomPercent, setZoomPercent] = useState(100);
	const onSlideDoubleClickRef = useRef(onSlideDoubleClick);
	const [copiedLabel, setCopiedLabel] = useState(false);

	useEffect(() => {
		onSlideDoubleClickRef.current = onSlideDoubleClick;
	}, [onSlideDoubleClick]);

	const sendZoom = useCallback((action: "in" | "out" | "reset") => {
		portRef.current?.postMessage({ type: "marp-zoom", action });
	}, []);

	const copyLabel = async () => {
		if (!label) {
			return;
		}

		try {
			await navigator.clipboard.writeText(label);
			setCopiedLabel(true);
			window.setTimeout(() => setCopiedLabel(false), 1200);
		} catch {
			toast.error("Failed to copy file name to clipboard");
		}
	};

	const rendered = useMemo(() => {
		// Project themes are registered on the shared Marp instance; this invalidates stale renders.
		void themeRevision;
		try {
			return renderMarp(markdown, projectId, selectedFileId, assetRevision, assetToken);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Error</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></section>`,
				css: "",
			};
		}
	}, [markdown, projectId, selectedFileId, themeRevision, assetRevision, assetToken]);

	const handlePortMessage = useCallback((event: MessageEvent) => {
		const payload = event.data;
		if (payload?.type === "marp-zoom-changed" && typeof payload.zoom === "number") {
			setZoomPercent(Math.round(payload.zoom * 100));
			return;
		}

		if (payload?.type === "marp-slide-doubleclick" && typeof payload.index === "number") {
			onSlideDoubleClickRef.current?.(payload.index);
			return;
		}

		if (!payload || payload.type !== "presentation-key") {
			return;
		}

		document.dispatchEvent(
			new KeyboardEvent(payload.eventType, {
				key: payload.key,
				code: payload.code,
				ctrlKey: payload.ctrlKey,
				shiftKey: payload.shiftKey,
				altKey: payload.altKey,
				metaKey: payload.metaKey,
				bubbles: true,
				cancelable: true,
			}),
		);
	}, []);

	const handleIframeLoad = useCallback(() => {
		const channel = new MessageChannel();
		portRef.current = channel.port1;
		channel.port1.onmessage = handlePortMessage;
		iframeRef.current?.contentWindow?.postMessage({ type: "init-port" }, "*", [channel.port2]);
		setIframeReady(true);
	}, [handlePortMessage]);

	useEffect(() => {
		if (!iframeReady || !portRef.current) {
			return;
		}

		const fileKey = `${projectId}/${selectedFileId}`;
		const scrollToTop = prevFileKeyRef.current !== fileKey;
		prevFileKeyRef.current = fileKey;

		// Must match --canvas in index.css; the srcDoc iframe can't read the
		// parent's CSS custom properties.
		const bg = resolvedTheme === "dark" ? "oklch(0.14 0 0)" : "oklch(0.92 0 0)";
		const pageShadow =
			resolvedTheme === "dark" ? "0 2px 12px rgb(0 0 0 / 0.55)" : "0 1px 6px rgb(0 0 0 / 0.18)";

		portRef.current.postMessage({
			type: "marp-update",
			scrollToTop,
			css: `
      html, body {
        margin: 0;
        min-height: 100%;
        box-sizing: border-box;
        background: ${bg};
        overflow: auto;
      }
      *, *::before, *::after {
        box-sizing: inherit;
      }
      ${rendered.css}
      div.marpit {
        display: flex;
        flex-direction: column;
        gap: 28px;
        align-items: center;
        width: 100%;
        padding: 24px 20px;
        box-sizing: border-box;
      }
      div.marpit > svg[data-marpit-svg],
      body > section {
        flex: 0 0 auto;
        border: 0;
        border-radius: 2px;
        box-shadow: ${pageShadow};
        height: auto !important;
        max-width: 100%;
        width: 100% !important;
      }
    `,
			html: rendered.html,
		});
	}, [iframeReady, rendered, resolvedTheme, projectId, selectedFileId]);

	useEffect(() => {
		if (!iframeReady || followSlideIndex === null || !portRef.current) {
			return;
		}

		portRef.current.postMessage({ type: "marp-scroll-to-slide", index: followSlideIndex });
	}, [iframeReady, followSlideIndex]);

	return (
		<div className="relative flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-canvas">
			<div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-1.5">
				<span className="truncate text-xs text-muted-foreground">
					{label ? `Active file: ${label}` : "No file selected"}
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Copy file name"
									onClick={copyLabel}
								>
									{copiedLabel ? <Check /> : <Copy />}
								</Button>
							}
						/>
						<TooltipContent>{copiedLabel ? "Copied!" : "Copy file name"}</TooltipContent>
					</Tooltip>
				</span>
				<div className="flex shrink-0 items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Zoom out"
									onClick={() => sendZoom("out")}
								>
									<MinusIcon />
								</Button>
							}
						/>
						<TooltipContent>Zoom out</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="xs"
									aria-label="Reset zoom"
									onClick={() => sendZoom("reset")}
									className="font-mono"
								>
									{zoomPercent}%
								</Button>
							}
						/>
						<TooltipContent>Reset zoom</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Zoom in"
									onClick={() => sendZoom("in")}
								>
									<PlusIcon />
								</Button>
							}
						/>
						<TooltipContent>Zoom in</TooltipContent>
					</Tooltip>
				</div>
			</div>

			<iframe
				ref={iframeRef}
				title="Marp preview"
				srcDoc={staticSrcDoc}
				className="min-h-0 w-full flex-1"
				sandbox="allow-scripts"
				onLoad={handleIframeLoad}
			/>
		</div>
	);
};
