import {
	dispatchSlideFrameKey,
	SLIDE_FRAME_BRIDGE_SCRIPT,
	useSlideFrameBridge,
} from "@/hooks/use-slide-frame-bridge";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SlideDisplay } from "@/lib/marp";
import { useTheme } from "./theme-provider";
import marpitSvgPolyfillScript from "@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw";
import { toast } from "sonner";

type PreviewPaneProps = {
	slides: SlideDisplay;
	label: string | null;
	projectId: string;
	selectedFileId: string | null;
	// Null when the editor is on another file. This scroll target stays local.
	followSlideIndex: number | null;
	// Receives the zero-based slide index on double-click.
	onSlideDoubleClick?: (index: number) => void;
};

// Push content over a MessagePort to preserve scroll position across edits.
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
        // Each content update calls this, so report zoom only when it changes.
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

      // Forward keys because events inside the iframe never reach page-level shortcuts.
      function forwardKey(event) {
        if (port) port.postMessage(slideFrameKeyMessage(event, false));
      }

      window.addEventListener('keydown', forwardKey);
      window.addEventListener('keyup', forwardKey);

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
        // Rebuilding the body recreates its image elements. Skip identical updates.
        if (!e.data.scrollToTop && e.data.html === lastHtml && e.data.css === lastCss) return;
        lastHtml = e.data.html;
        // Re-parsing unchanged styles would reload embedded theme fonts on every keystroke.
        if (e.data.css !== lastCss) {
          lastCss = e.data.css;
          document.getElementById('marp-styles').textContent = e.data.css;
        }
        document.body.innerHTML = e.data.html;
        if (e.data.scrollToTop) {
          window.scrollTo(0, 0);
          zoom = 1;
        }
        applyZoom();
      }

      ${SLIDE_FRAME_BRIDGE_SCRIPT}
      listenForSlideFramePort(handlePortMessage);
    </script>
  </head>
  <body></body>
</html>`;

export const PreviewPane = ({
	slides,
	label,
	projectId,
	selectedFileId,
	followSlideIndex,
	onSlideDoubleClick,
}: PreviewPaneProps) => {
	const { resolvedTheme } = useTheme();
	const prevFileKeyRef = useRef<string | null>(null);
	const [zoomPercent, setZoomPercent] = useState(100);
	const [copiedLabel, setCopiedLabel] = useState(false);
	const { port, load, connect } = useSlideFrameBridge((event) => {
		const payload = event.data;
		if (payload?.type === "marp-zoom-changed" && typeof payload.zoom === "number") {
			setZoomPercent(Math.round(payload.zoom * 100));
			return;
		}
		if (payload?.type === "marp-slide-doubleclick" && typeof payload.index === "number") {
			onSlideDoubleClick?.(payload.index);
			return;
		}
		dispatchSlideFrameKey(payload);
	});

	const sendZoom = (action: "in" | "out" | "reset") => {
		port.current?.postMessage({ type: "marp-zoom", action });
	};

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

	useEffect(() => {
		if (!load || !port.current) {
			return;
		}

		const fileKey = `${projectId}/${selectedFileId}`;
		const scrollToTop = prevFileKeyRef.current !== fileKey;
		prevFileKeyRef.current = fileKey;

		// Match --canvas in index.css because srcDoc cannot read the parent's custom properties.
		const bg = resolvedTheme === "dark" ? "oklch(0.14 0 0)" : "oklch(0.92 0 0)";
		const pageShadow =
			resolvedTheme === "dark" ? "0 2px 12px rgb(0 0 0 / 0.55)" : "0 1px 6px rgb(0 0 0 / 0.18)";

		port.current.postMessage({
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
      ${slides.css}
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
			html: slides.html,
		});
	}, [load, slides, resolvedTheme, projectId, selectedFileId, port]);

	useEffect(() => {
		if (!load || followSlideIndex === null || !port.current) {
			return;
		}

		port.current.postMessage({ type: "marp-scroll-to-slide", index: followSlideIndex });
	}, [load, followSlideIndex, port]);

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
				title="Marp preview"
				srcDoc={staticSrcDoc}
				className="min-h-0 w-full flex-1"
				sandbox="allow-scripts"
				onLoad={connect}
			/>
		</div>
	);
};
