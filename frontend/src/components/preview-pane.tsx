import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { createMarpRenderErrorFallback } from "@/lib/marp-render-error";
import { renderMarp } from "@/lib/marp";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";
import { getSecondaryScreen } from "@/lib/screen-management";
import marpitSvgPolyfillScript from "@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw";
import { AlertTriangleIcon } from "lucide-react";

type PreviewPaneProps = {
	markdown: string;
	label: string | null;
	projectId: string;
	selectedFileId: string | null;
	themeRevision: number;
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

      function applyZoom() {
        var el = document.querySelector('div.marpit');
        if (el) el.style.transform = 'scale(' + zoom + ')';
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
        if (!e.data || e.data.type !== 'marp-update') return;
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
}: PreviewPaneProps) => {
	const { resolvedTheme } = useTheme();
	const navigate = useNavigate();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [iframeReady, setIframeReady] = useState(false);
	const prevFileKeyRef = useRef<string | null>(null);

	const handleStartPresentation = useCallback(async () => {
		const secondaryScreen = await getSecondaryScreen();

		if (secondaryScreen) {
			const viewerPath = `/presentations/${projectId}?mode=viewer&fullscreen=true${selectedFileId ? `&file=${encodeURIComponent(selectedFileId)}` : ""}`;
			window.open(
				viewerPath,
				"_blank",
				`left=${secondaryScreen.left},top=${secondaryScreen.top},width=${secondaryScreen.width},height=${secondaryScreen.height}`,
			);
		}

		void navigate({
			to: "/presentations/$id",
			params: { id: projectId },
			search: { mode: "present", file: selectedFileId ?? undefined },
		});
	}, [navigate, projectId, selectedFileId]);

	const rendered = useMemo(() => {
		// Project themes are registered on the shared Marp instance; this invalidates stale renders.
		void themeRevision;
		try {
			return {
				...renderMarp(markdown, projectId, selectedFileId),
				errorMessage: null,
			};
		} catch (error) {
			return createMarpRenderErrorFallback(error);
		}
	}, [markdown, projectId, selectedFileId, themeRevision]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== iframeRef.current?.contentWindow) {
				return;
			}

			const payload = event.data;
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

		const bg = resolvedTheme === "dark" ? "oklch(0.205 0 0)" : "oklch(1 0 0)";
		const border = resolvedTheme === "dark" ? "oklch(1 0 0 / 10%)" : "oklch(0.922 0 0)";

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
        gap: 24px;
        align-items: center;
        width: 100%;
      }
      div.marpit > svg[data-marpit-svg],
      body > section {
        flex: 0 0 auto;
        border: 1px solid ${border};
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
		<Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/80 py-0">
			<CardHeader className="shrink-0 border border-border px-4 py-3">
				<CardTitle>Live Preview</CardTitle>
				<CardAction className="flex items-center gap-2">
					{label ? (
						<Button variant="outline" size="sm" onClick={() => void handleStartPresentation()}>
							Start presentation
						</Button>
					) : (
						<Button variant="outline" size="sm" disabled>
							Start presentation
						</Button>
					)}
				</CardAction>
				<CardDescription>{label ? `Active file: ${label}` : "No file selected"}</CardDescription>
				{rendered.errorMessage && (
					<Alert className="col-span-full mt-2 border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-50">
						<AlertTriangleIcon />
						<AlertTitle>Marp konnte nicht gerendert werden</AlertTitle>
						<AlertDescription className="text-foreground text-wrap whitespace-pre-line break-words">
							{rendered.errorMessage}
						</AlertDescription>
					</Alert>
				)}
			</CardHeader>

			<CardContent className="min-h-0 flex-1 overflow-hidden p-0">
				<iframe
					ref={iframeRef}
					title="Marp preview"
					srcDoc={staticSrcDoc}
					className="h-full w-full"
					sandbox="allow-scripts allow-same-origin"
					onLoad={() => setIframeReady(true)}
				/>
			</CardContent>
		</Card>
	);
};
