import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { renderMarp } from "@/lib/marp";
import { useTheme } from "./theme-provider";
import marpitSvgPolyfillScript from "@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw";

type PreviewPaneProps = {
	markdown: string;
	label: string | null;
	projectId: string;
	selectedFileId: string | null;
	themeRevision: number;
	assetRevision: number;
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
          window.parent.postMessage({ type: 'marp-zoom-changed', zoom: zoom }, '*');
        }
      }

      function resetZoom() {
        zoom = 1;
        var el = document.querySelector('div.marpit');
        if (el) el.style.transformOrigin = '';
        applyZoom();
        window.scrollTo(0, 0);
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

      window.addEventListener('dblclick', function (e) {
        if (zoom === 1) return;
        e.preventDefault();
        resetZoom();
      });

      // Keydown/keyup inside the iframe don't bubble to the parent document, so
      // page-level hotkeys (theme toggle, focus mode, etc.) would stop working once
      // the iframe has focus. Forward raw key events to the parent, which re-dispatches
      // them on its own document.
      function forwardKey(type) {
        return function (e) {
          window.parent.postMessage({
            type: 'presentation-key',
            eventType: type,
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
          }, '*');
        };
      }

      window.addEventListener('keydown', forwardKey('keydown'));
      window.addEventListener('keyup', forwardKey('keyup'));

      window.addEventListener('message', function(e) {
        if (e.source !== window.parent) return;
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
        if (e.data.type !== 'marp-update') return;
        document.getElementById('marp-styles').textContent = e.data.css;
        document.body.innerHTML = e.data.html;
        if (e.data.scrollToTop) {
          window.scrollTo(0, 0);
          zoom = 1;
        }
        applyZoom();
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
}: PreviewPaneProps) => {
	const { resolvedTheme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [iframeReady, setIframeReady] = useState(false);
	const prevFileKeyRef = useRef<string | null>(null);
	const [zoomPercent, setZoomPercent] = useState(100);

	const sendZoom = useCallback((action: "in" | "out" | "reset") => {
		iframeRef.current?.contentWindow?.postMessage(
			{ type: "marp-zoom", action },
			window.location.origin,
		);
	}, []);

	const rendered = useMemo(() => {
		// Project themes are registered on the shared Marp instance; this invalidates stale renders.
		void themeRevision;
		try {
			return renderMarp(markdown, projectId, selectedFileId, assetRevision);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Error</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></section>`,
				css: "",
			};
		}
	}, [markdown, projectId, selectedFileId, themeRevision, assetRevision]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== iframeRef.current?.contentWindow) {
				return;
			}

			const payload = event.data;
			if (payload?.type === "marp-zoom-changed" && typeof payload.zoom === "number") {
				setZoomPercent(Math.round(payload.zoom * 100));
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
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	useEffect(() => {
		if (!iframeReady || !iframeRef.current?.contentWindow) {
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

		iframeRef.current.contentWindow.postMessage(
			{
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
			},
			window.location.origin,
		);
	}, [iframeReady, rendered, resolvedTheme, projectId, selectedFileId]);

	return (
		<div className="relative flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-canvas">
			<div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-1.5">
				<span className="truncate text-xs text-muted-foreground">
					{label ? `Active file: ${label}` : "No file selected"}
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
				sandbox="allow-scripts allow-same-origin"
				onLoad={() => setIframeReady(true)}
			/>
		</div>
	);
};
