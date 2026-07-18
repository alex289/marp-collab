import { renderMarp } from "@/lib/marp";
import { useEffect, useMemo, useRef } from "react";
import { useKeyHold } from "@tanstack/react-hotkeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import marpitSvgPolyfillScript from "@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw";

type PresentationFrameProps = {
	markdown: string;
	slideIndex: number;
	projectId?: string;
	selectedFileId?: string | null;
	themeRevision: number;
	assetRevision?: number;
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
	assetRevision = 0,
	onMetaChange,
	showSpeakerNotes = false,
	className,
}: PresentationFrameProps) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	// Shift held anywhere (iframe key events are forwarded to this document) turns
	// the cursor into a laser pointer on the active slide.
	const isLaserActive = useKeyHold("Shift");

	const rendered = useMemo(() => {
		// Project themes are registered on the shared Marp instance; this invalidates stale renders.
		void themeRevision;
		try {
			return renderMarp(markdown, projectId, selectedFileId, assetRevision);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Error</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></section>`,
				css: "",
				comments: [[]],
			};
		}
	}, [markdown, projectId, selectedFileId, themeRevision, assetRevision]);

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
        overflow: auto;
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
    <script>
      ${marpitSvgPolyfillScript}
    </script>
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
        var zoom = 1;
        var MIN_ZOOM = 1;
        var MAX_ZOOM = 4;

        function clamp(index) {
					var max = Math.max(0, slides.length - 1);
          return Math.min(Math.max(index, 0), max);
        }

        function applyZoom() {
          var slide = slides[active];
          if (slide) slide.style.setProperty('transform', 'scale(' + zoom + ')', 'important');
        }

        function resetZoom() {
          zoom = 1;
          var slide = slides[active];
          if (slide) slide.style.transformOrigin = '';
          applyZoom();
          window.scrollTo(0, 0);
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
          var next = clamp(index);
          if (next !== active) zoom = 1;
          active = next;
					slides.forEach(function (slide, i) {
						if (i === active) {
							slide.style.setProperty('display', 'block', 'important');
							fit(slide);
							applyZoom();
							slide.removeAttribute('aria-hidden');
						} else {
							slide.style.removeProperty('transform');
							slide.style.setProperty('display', 'none', 'important');
							slide.setAttribute('aria-hidden', 'true');
						}
          });
          report();
        }

        window.addEventListener('resize', function () {
          fit(slides[active]);
          applyZoom();
        });

        window.addEventListener('wheel', function (e) {
          if (!e.ctrlKey) return;
          e.preventDefault();

          var slide = slides[active];
          if (slide) {
            var rect = slide.getBoundingClientRect();
            var originX = ((e.clientX - rect.left) / rect.width) * 100;
            var originY = ((e.clientY - rect.top) / rect.height) * 100;
            slide.style.transformOrigin = originX + '% ' + originY + '%';
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

        // Keydown/keyup inside the iframe don't bubble to the parent document, so the
        // presentation hotkeys (slide navigation, escape, etc.) would stop working once
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

        // Laser pointer: while Shift is held, replace the cursor with a glowing
        // red dot. The parent syncs the held state via 'presentation-laser'
        // messages; mousemove's shiftKey keeps it accurate while the pointer
        // moves inside this frame.
        var laser = document.createElement('div');
        laser.style.cssText = 'position:fixed;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle, #ff6b6b 0%, #f00 45%, rgba(255,0,0,0) 72%);box-shadow:0 0 14px 5px rgba(255,0,0,0.55);pointer-events:none;z-index:2147483647;display:none;';
        document.body.appendChild(laser);

        var laserActive = false;
        var laserX = -1;
        var laserY = -1;

        function updateLaser() {
          var visible = laserActive && laserX >= 0;
          laser.style.display = visible ? 'block' : 'none';
          laser.style.transform = 'translate(' + laserX + 'px,' + laserY + 'px)';
          document.documentElement.style.cursor = laserActive ? 'none' : '';
          document.body.style.cursor = laserActive ? 'none' : '';
        }

        window.addEventListener('mousemove', function (e) {
          laserX = e.clientX;
          laserY = e.clientY;
          laserActive = e.shiftKey;
          updateLaser();
        });

        document.addEventListener('mouseleave', function () {
          laserX = -1;
          laserY = -1;
          updateLaser();
        });

        window.addEventListener('message', function (event) {
          var data = event.data;
          if (!data) {
            return;
          }
          if (data.type === 'presentation-laser') {
            laserActive = !!data.active;
            updateLaser();
            return;
          }
          if (data.type !== 'presentation-set-slide') {
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
			if (!payload) {
				return;
			}

			if (payload.type === "presentation-meta") {
				onMetaChange?.({
					active: Number(payload.active) || 0,
					total: Number(payload.total) || 1,
				});
				return;
			}

			if (payload.type === "presentation-key") {
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
			}
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

	useEffect(() => {
		iframeRef.current?.contentWindow?.postMessage(
			{
				type: "presentation-laser",
				active: isLaserActive,
			},
			"*",
		);
	}, [isLaserActive, srcDoc]);

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
