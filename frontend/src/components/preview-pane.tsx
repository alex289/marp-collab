import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { renderMarp } from "@/lib/marp";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";
import { getSecondaryScreen } from "@/lib/screen-management";
import {
	IFRAME_KEYDOWN_FORWARDING_SCRIPT,
	useForwardedIframeKeydown,
} from "@/lib/iframe-keydown-forwarding";

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
      window.addEventListener('message', function(e) {
        if (e.source !== window.parent) return;
        if (!e.data || e.data.type !== 'marp-update') return;
        document.getElementById('marp-styles').textContent = e.data.css;
        document.body.innerHTML = e.data.html;
        if (e.data.scrollToTop) window.scrollTo(0, 0);
      });
    </script>
    <script>
      ${IFRAME_KEYDOWN_FORWARDING_SCRIPT}
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

	useForwardedIframeKeydown(iframeRef);

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
			return renderMarp(markdown, projectId, selectedFileId);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Fehler</h1><p>${error instanceof Error ? error.message : "Unbekannter Fehler"}</p></section>`,
				css: "",
			};
		}
	}, [markdown, projectId, selectedFileId, themeRevision]);

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
        overflow-x: hidden;
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
