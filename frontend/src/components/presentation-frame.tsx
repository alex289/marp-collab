import { renderMarp } from "@/lib/marp";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	assetToken?: string;
	onMetaChange?: (meta: { active: number; total: number }) => void;
	showSpeakerNotes?: boolean;
	className?: string;
};

// srcDoc never changes so the iframe never reloads. Slide content is pushed
// in via postMessage so a markdown edit doesn't flash/reset the frame.
const staticSrcDoc = `<!doctype html>
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
    <style id="marp-theme"></style>
    <script>
      ${marpitSvgPolyfillScript}
    </script>
  </head>
  <body>
    <div id="content"></div>
    <script>
      (function () {
        var content = document.getElementById('content');
        var slides = [];
        var active = 0;
        var zoom = 1;
        var MIN_ZOOM = 1;
        var MAX_ZOOM = 4;
        // Set once the parent hands over a MessagePort (see 'init-port' below).
        var port = null;
        // Thumbnail frames (e.g. the next-slide preview) opt out of zoom, laser
        // pointer and key forwarding via the 'presentation-config' message.
        var interactive = true;

        function collectSlides() {
          var found = Array.from(content.querySelectorAll('svg[data-marpit-svg]'));
          if (found.length === 0) {
            found = Array.from(content.querySelectorAll('section'));
          }
          if (found.length === 0) {
            found = [content];
          }
          return found;
        }

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
          if (!port) {
            return;
          }
          port.postMessage({
            type: 'presentation-meta',
            active: active,
            total: slides.length,
          });
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

        // Re-renders the slide deck in place (on markdown/theme changes) while
        // keeping the current slide index and resetting zoom, like a fresh load.
        function updateContent(html, css) {
          document.getElementById('marp-theme').textContent = css;
          content.innerHTML = html;
          slides = collectSlides();
          zoom = 1;
          apply(active);
        }

        window.addEventListener('resize', function () {
          fit(slides[active]);
          applyZoom();
        });

        window.addEventListener('wheel', function (e) {
          if (!interactive || !e.ctrlKey) return;
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
          if (!interactive || zoom === 1) return;
          e.preventDefault();
          resetZoom();
        });

        // Keydown/keyup inside the iframe don't bubble to the parent document, so the
        // presentation hotkeys (slide navigation, escape, etc.) would stop working once
        // the iframe has focus. Forward raw key events to the parent, which re-dispatches
        // them on its own document.
        function forwardKey(type) {
          return function (e) {
            if (!interactive || !port) {
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
          if (!interactive) return;
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

        function handlePortMessage(event) {
          var data = event.data;
          if (!data) {
            return;
          }
          if (data.type === 'presentation-config') {
            interactive = data.interactive !== false;
            if (!interactive) {
              laserActive = false;
              updateLaser();
            }
            return;
          }
          if (data.type === 'presentation-laser') {
            laserActive = !!data.active;
            updateLaser();
            return;
          }
          if (data.type === 'marp-update') {
            updateContent(data.html, data.css);
            return;
          }
          if (data.type !== 'presentation-set-slide') {
            return;
          }
          apply(Number(data.index) || 0);
        }

        window.addEventListener('message', function (event) {
          var data = event.data;
          if (!data || data.type !== 'init-port' || !event.ports || !event.ports[0]) {
            return;
          }
          port = event.ports[0];
          port.onmessage = handlePortMessage;
          report();
        });
      })();
    </script>
  </body>
</html>`;

type SlideFrameProps = {
	title: string;
	html: string;
	css: string;
	slideIndex: number;
	/** Non-interactive frames (thumbnails) skip zoom, laser pointer and key forwarding. */
	interactive?: boolean;
	isLaserActive?: boolean;
	onMetaChange?: (meta: { active: number; total: number }) => void;
	className?: string;
};

function SlideFrame({
	title,
	html,
	css,
	slideIndex,
	interactive = true,
	isLaserActive = false,
	onMetaChange,
	className,
}: SlideFrameProps) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	// MessagePort to the iframe, set on load instead of using broadcast
	// postMessage(..., "*") so a navigated-away frame can't keep receiving messages.
	const portRef = useRef<MessagePort | null>(null);
	const [iframeReady, setIframeReady] = useState(false);
	const slideIndexRef = useRef(slideIndex);
	const isLaserActiveRef = useRef(isLaserActive);
	const interactiveRef = useRef(interactive);
	const onMetaChangeRef = useRef(onMetaChange);

	useEffect(() => {
		slideIndexRef.current = slideIndex;
	}, [slideIndex]);

	useEffect(() => {
		isLaserActiveRef.current = isLaserActive;
	}, [isLaserActive]);

	useEffect(() => {
		interactiveRef.current = interactive;
	}, [interactive]);

	useEffect(() => {
		onMetaChangeRef.current = onMetaChange;
	}, [onMetaChange]);

	const handlePortMessage = useCallback((event: MessageEvent) => {
		const payload = event.data;
		if (!payload) {
			return;
		}

		if (payload.type === "presentation-meta") {
			onMetaChangeRef.current?.({
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
	}, []);

	const handleIframeLoad = useCallback(() => {
		const channel = new MessageChannel();
		portRef.current = channel.port1;
		channel.port1.onmessage = handlePortMessage;
		iframeRef.current?.contentWindow?.postMessage({ type: "init-port" }, "*", [channel.port2]);
		// The fresh document has no content yet; resync it with the presenter's
		// current slide/laser state once the first marp-update arrives.
		portRef.current.postMessage({
			type: "presentation-config",
			interactive: interactiveRef.current,
		});
		portRef.current.postMessage({
			type: "presentation-set-slide",
			index: slideIndexRef.current,
		});
		portRef.current.postMessage({
			type: "presentation-laser",
			active: isLaserActiveRef.current,
		});
		setIframeReady(true);
	}, [handlePortMessage]);

	useEffect(() => {
		if (!iframeReady) {
			return;
		}

		portRef.current?.postMessage({
			type: "marp-update",
			html,
			css,
		});
	}, [iframeReady, html, css]);

	useEffect(() => {
		portRef.current?.postMessage({
			type: "presentation-set-slide",
			index: slideIndex,
		});
	}, [slideIndex]);

	useEffect(() => {
		portRef.current?.postMessage({
			type: "presentation-laser",
			active: isLaserActive,
		});
	}, [isLaserActive]);

	return (
		<iframe
			ref={iframeRef}
			title={title}
			srcDoc={staticSrcDoc}
			className={className ?? "h-full w-full border-0"}
			sandbox="allow-scripts"
			onLoad={handleIframeLoad}
		/>
	);
}

export function PresentationFrame({
	markdown,
	slideIndex,
	projectId,
	selectedFileId,
	themeRevision,
	assetRevision = 0,
	assetToken,
	onMetaChange,
	showSpeakerNotes = false,
	className,
}: PresentationFrameProps) {
	// Shift held anywhere (iframe key events are forwarded to this document) turns
	// the cursor into a laser pointer on the active slide.
	const isLaserActive = useKeyHold("Shift");

	const rendered = useMemo(() => {
		// Project themes are registered on the shared Marp instance; this invalidates stale renders.
		void themeRevision;
		try {
			return renderMarp(markdown, projectId, selectedFileId, assetRevision, assetToken);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Error</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></section>`,
				css: "",
				comments: [[]],
			};
		}
	}, [markdown, projectId, selectedFileId, themeRevision, assetRevision, assetToken]);

	const activeComments = rendered.comments[slideIndex] ?? [];
	const hasSpeakerNotes = activeComments.some((comment) => comment.trim().length > 0);
	// Marp returns one comment bucket per slide, so this doubles as the slide count.
	const hasNextSlide = slideIndex + 1 < rendered.comments.length;

	const slide = (
		<SlideFrame
			title="Presentation"
			html={rendered.html}
			css={rendered.css}
			slideIndex={slideIndex}
			isLaserActive={isLaserActive}
			onMetaChange={onMetaChange}
			className={
				showSpeakerNotes
					? "h-full w-full border-0 bg-black"
					: (className ?? "h-full w-full border-0")
			}
		/>
	);

	if (!showSpeakerNotes) {
		return slide;
	}

	return (
		<div className={className ?? "h-full w-full"}>
			<div className="grid h-full w-full grid-cols-1 gap-3  p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,24vw)]">
				<div className="hidden min-h-0 overflow-hidden rounded-md border border-white/10 shadow-2xl md:block">
					{slide}
				</div>
				<div className="flex min-h-0 flex-col gap-3">
					<Card className="hidden shrink-0 flex-col overflow-hidden py-0 shadow-2xl md:flex gap-0">
						<CardHeader className="shrink-0 border-b border-border px-4 py-3">
							<CardTitle>Next slide</CardTitle>
						</CardHeader>
						<CardContent className="relative aspect-video px-0">
							{/* Kept mounted past the last slide so stepping back doesn't reload the iframe. */}
							<SlideFrame
								title="Next slide preview"
								html={rendered.html}
								css={rendered.css}
								slideIndex={slideIndex + 1}
								interactive={false}
								className="pointer-events-none h-full w-full border-0 bg-black"
							/>
							{!hasNextSlide && (
								<div className="absolute inset-0 flex items-center justify-center bg-card">
									<p className="text-sm text-muted-foreground">End of presentation</p>
								</div>
							)}
						</CardContent>
					</Card>
					<Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0 shadow-2xl">
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
		</div>
	);
}
