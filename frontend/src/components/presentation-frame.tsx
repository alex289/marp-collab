import { renderMarp } from "@/lib/marp";
import { useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PresentationFrameProps = {
	markdown: string;
	slideIndex: number;
	projectId?: string;
	selectedFileId?: string | null;
	themeRevision: number;
	onMetaChange?: (meta: { active: number; total: number }) => void;
	showSpeakerNotes?: boolean;
	className?: string;
};

export function PresentationFrame({
	markdown,
	slideIndex,
	projectId,
	selectedFileId,
	themeRevision,
	onMetaChange,
	showSpeakerNotes = false,
	className,
}: PresentationFrameProps) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);

	const rendered = useMemo(() => {
		// Project themes are registered on the shared Marp instance; this invalidates stale renders.
		void themeRevision;
		try {
			return renderMarp(markdown, projectId, selectedFileId);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Error</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></section>`,
				css: "",
				comments: [[]],
			};
		}
	}, [markdown, projectId, selectedFileId, themeRevision]);

	const activeComments = rendered.comments[slideIndex] ?? [];
	const hasSpeakerNotes = activeComments.some((comment) => comment.trim().length > 0);

	const srcDoc = useMemo(() => {
		return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }
      ${rendered.css}
      body {
        align-items: center;
        display: flex;
        justify-content: center;
      }
      svg[data-marpit-svg] {
        flex: 0 1 auto;
        max-height: 100%;
        max-width: 100%;
      }
      section {
        flex: 0 1 auto;
        max-height: 100%;
        max-width: 100%;
      }
    </style>
  </head>
  <body>
    ${rendered.html}
    <script>
      (function () {
				var slides = Array.from(document.querySelectorAll('svg[data-marpit-svg]'));
				if (slides.length === 0) {
					slides = Array.from(document.querySelectorAll('section'));
				}
				if (slides.length === 0) {
					slides = [document.body];
        }

        var active = 0;

        function clamp(index) {
					var max = Math.max(0, slides.length - 1);
          return Math.min(Math.max(index, 0), max);
        }

        function report() {
          window.parent.postMessage(
            {
              type: 'presentation-meta',
              active: active,
							total: slides.length,
            },
            '*'
          );
        }

        function slideAspect(slide) {
          if (slide.viewBox && slide.viewBox.baseVal && slide.viewBox.baseVal.width > 0 && slide.viewBox.baseVal.height > 0) {
            return slide.viewBox.baseVal.width / slide.viewBox.baseVal.height;
          }

          var width = Number.parseFloat(slide.getAttribute('width') || '');
          var height = Number.parseFloat(slide.getAttribute('height') || '');
          return width > 0 && height > 0 ? width / height : 16 / 9;
        }

        function fit(slide) {
          var containerWidth = window.innerWidth;
          var containerHeight = window.innerHeight;
          var containerAspect = containerWidth / Math.max(containerHeight, 1);
          var aspect = slideAspect(slide);
          var width = containerWidth;
          var height = containerWidth / aspect;

          if (containerAspect > aspect) {
            height = containerHeight;
            width = containerHeight * aspect;
          }

          slide.style.setProperty('height', height + 'px', 'important');
          slide.style.setProperty('width', width + 'px', 'important');
        }

        function apply(index) {
          active = clamp(index);
					slides.forEach(function (slide, i) {
						if (i === active) {
							slide.style.setProperty('display', 'block', 'important');
							fit(slide);
							slide.removeAttribute('aria-hidden');
						} else {
							slide.style.setProperty('display', 'none', 'important');
							slide.setAttribute('aria-hidden', 'true');
						}
          });
          report();
        }

        window.addEventListener('resize', function () {
          fit(slides[active]);
        });

        window.addEventListener('message', function (event) {
          var data = event.data;
          if (!data || data.type !== 'presentation-set-slide') {
            return;
          }
          apply(Number(data.index) || 0);
        });

        apply(0);
      })();
    </script>
  </body>
</html>`;
	}, [rendered.css, rendered.html]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== iframeRef.current?.contentWindow) {
				return;
			}

			const payload = event.data;
			if (!payload || payload.type !== "presentation-meta") {
				return;
			}

			onMetaChange?.({
				active: Number(payload.active) || 0,
				total: Number(payload.total) || 1,
			});
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [onMetaChange]);

	useEffect(() => {
		iframeRef.current?.contentWindow?.postMessage(
			{
				type: "presentation-set-slide",
				index: slideIndex,
			},
			"*",
		);
	}, [slideIndex, srcDoc]);

	const iframe = (
		<iframe
			ref={iframeRef}
			title="Presentation"
			srcDoc={srcDoc}
			className={
				showSpeakerNotes
					? "h-full w-full border-0 bg-black"
					: (className ?? "h-full w-full border-0")
			}
			sandbox="allow-scripts allow-same-origin"
		/>
	);

	if (!showSpeakerNotes) {
		return iframe;
	}

	return (
		<div className={className ?? "h-full w-full"}>
			<div className="grid h-full w-full grid-cols-1 gap-3  p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,24vw)]">
				<div className="hidden min-h-0 overflow-hidden rounded-md border border-white/10 shadow-2xl md:block">
					{iframe}
				</div>
				<Card className="flex min-h-0 flex-col overflow-hidden py-0 shadow-2xl">
					<CardHeader className="shrink-0 border-b border-border px-4 py-3">
						<CardTitle>Speaker notes</CardTitle>
					</CardHeader>
					<CardContent className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
						{hasSpeakerNotes ? (
							<div className="space-y-3 text-sm leading-6">
								{activeComments.map((comment, index) => {
									const trimmed = comment.trim();

									if (!trimmed) {
										return null;
									}

									return (
										<p className="whitespace-pre-wrap" key={`${index}-${trimmed}`}>
											{trimmed}
										</p>
									);
								})}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">No speaker notes for this slide.</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
