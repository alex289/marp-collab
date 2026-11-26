import {
	dispatchSlideFrameKey,
	SLIDE_FRAME_BRIDGE_SCRIPT,
	useSlideFrameBridge,
} from "@/hooks/use-slide-frame-bridge";
import type { SlideDisplay } from "@/lib/marp";
import { getSectionMarkerSlides } from "@/lib/slide-blocks";
import { useEffect, useMemo, type SyntheticEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import marpitSvgPolyfillScript from "@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw";
import builtinTransitionKeyframes from "@/lib/marp-transition-keyframes.css?raw";
import { ArrowRightIcon, LaptopIcon, Mic2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoControls } from "@/components/demo-controls";
import {
	findPresenterImage,
	getNextPresenterChange,
	parseSlidePresenterComments,
	type PresenterUser,
} from "@/lib/presenter-comments";

type PresentationFrameProps = {
	markdown: string;
	slides: SlideDisplay;
	slideIndex: number;
	onMetaChange?: (meta: { active: number; total: number }) => void;
	zoomState?: ZoomState;
	onZoomChange?: (state: ZoomState) => void;
	laserState?: LaserState;
	onLaserChange?: (state: LaserState) => void;
	presenterUsers?: readonly PresenterUser[];
	showSpeakerNotes?: boolean;
	demoActive?: boolean;
	demoContainer?: HTMLElement | null;
	onDemoStart?: () => void;
	onDemoEnd?: (options: { advance: boolean }) => void;
	onToggleFullscreen?: () => void;
	/** Lets the caller size the demo controls for speaker notes. */
	onHasSpeakerNotesChange?: (hasSpeakerNotes: boolean) => void;
	className?: string;
};

// Push edits over a MessagePort so updating the deck does not reload the iframe.
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
    <style>
      ${builtinTransitionKeyframes}

      @keyframes __marp_collab_transition_reduced_outgoing__ {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes __marp_collab_transition_reduced_incoming__ {
        from { opacity: 0; mix-blend-mode: plus-lighter; }
        to { opacity: 1; mix-blend-mode: plus-lighter; }
      }
      ::view-transition-group(root) {
        animation-duration: var(--marp-collab-transition-duration, 0.5s);
        animation-timing-function: ease;
      }
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation-name: var(--marp-collab-transition-name, __marp_collab_transition_no_animation__);
        animation-duration: var(--marp-collab-transition-duration, 0.5s);
        animation-delay: 0s;
        animation-direction: var(--marp-collab-transition-direction, normal);
        animation-fill-mode: both;
        animation-timing-function: linear;
        mix-blend-mode: normal;
      }
    </style>
    <style id="marp-theme"></style>
    <style id="marp-transition"></style>
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
        // Keep the requested slide index until the first render provides slides to clamp it against.
        var desired = 0;
        var zoom = 1;
        var zoomOriginX = 50;
        var zoomOriginY = 50;
        var MIN_ZOOM = 1;
        var MAX_ZOOM = 4;
        var port = null;
        var lastHtml = null;
        var lastCss = null;
        var interactive = true;

        // Slide transitions follow Marp CLI: the slide being left forward (data-transition) or
        // backward (data-transition-back) picks keyframes named marp-[incoming-|outgoing-]
        // transition[-backward]-<name> from the theme, falling back to the built-in ones.
        var transitionStyle = document.getElementById('marp-transition');
        var transitionKeyframes = null;
        var currentTransition = null;
        var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        var TRANSITION_TYPES = { both: '', outgoing: 'outgoing-', incoming: 'incoming-' };
        var TRANSITION_DIRECTIONS = { forward: '', backward: '-backward' };
        var REDUCED_TRANSITION = {
          forward: {
            incoming: { name: '__marp_collab_transition_reduced_incoming__' },
            outgoing: { name: '__marp_collab_transition_reduced_outgoing__' },
          },
          backward: {},
        };
        var NAME_PATTERN = /^[\\w-]+$/;
        var DURATION_PATTERN = /^(?:\\d+\\.?\\d*|\\.\\d+)m?s$/;

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
          if (!slide) return;
          slide.style.transformOrigin = zoomOriginX + '% ' + zoomOriginY + '%';
          slide.style.setProperty('transform', 'scale(' + zoom + ')', 'important');
        }

        function reportZoom() {
          if (!port) return;
          port.postMessage({
            type: 'presentation-zoom-report',
            zoom: zoom,
            originX: zoomOriginX,
            originY: zoomOriginY,
          });
        }

        function resetZoom() {
          zoom = 1;
          zoomOriginX = 50;
          zoomOriginY = 50;
          applyZoom();
          window.scrollTo(0, 0);
          reportZoom();
        }

        function report() {
          // An empty initial report would reset the parent's slide index.
          if (!port || slides.length === 0) {
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
          var zoomReset = next !== active;
          if (zoomReset) {
            zoom = 1;
            zoomOriginX = 50;
            zoomOriginY = 50;
          }
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
          if (zoomReset) reportZoom();
        }

        function collectKeyframes(rules, found) {
          for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (rule.type === 7) {
              found[rule.name] = rule;
              continue;
            }
            try {
              if (rule.styleSheet) collectKeyframes(rule.styleSheet.cssRules, found);
              else if (rule.cssRules) collectKeyframes(rule.cssRules, found);
            } catch (e) {
              // Cross-origin imports hide their rules.
            }
          }
        }

        function findKeyframes(name) {
          if (!transitionKeyframes) {
            transitionKeyframes = {};
            for (var i = 0; i < document.styleSheets.length; i++) {
              try {
                collectKeyframes(document.styleSheets[i].cssRules, transitionKeyframes);
              } catch (e) {
                // Skip sheets whose rules are not readable.
              }
            }
          }
          return Object.prototype.hasOwnProperty.call(transitionKeyframes, name)
            ? transitionKeyframes[name]
            : null;
        }

        // Themes set a default duration with --marp-transition-duration in the first keyframe.
        function keyframesDuration(rule) {
          for (var i = 0; i < rule.cssRules.length; i++) {
            var keyframe = rule.cssRules[i];
            if (!/(^|,)\\s*(from|0%)\\s*(,|$)/.test(keyframe.keyText)) continue;
            var value = keyframe.style.getPropertyValue('--marp-transition-duration').trim();
            if (DURATION_PATTERN.test(value)) return value;
          }
          return undefined;
        }

        function resolveTransitionKeyframes(name) {
          var resolved = { forward: {}, backward: {} };
          var found = false;
          Object.keys(TRANSITION_TYPES).forEach(function (type) {
            Object.keys(TRANSITION_DIRECTIONS).forEach(function (direction) {
              var keyframeName =
                'marp-' + TRANSITION_TYPES[type] + 'transition' + TRANSITION_DIRECTIONS[direction] + '-' + name;
              var rule = findKeyframes(keyframeName);
              if (!rule) return;
              resolved[direction][type] = { name: keyframeName, duration: keyframesDuration(rule) };
              found = true;
            });
          });
          return found ? resolved : null;
        }

        function transitionAnimation(keyframes, type, backward) {
          var target = keyframes[backward ? 'backward' : 'forward'];
          if (target[type]) return { name: target[type].name };
          // A single keyframe animates the outgoing slide and plays in reverse for the incoming one.
          if (target.both) return { name: target.both.name, reverse: type === 'incoming' };
          if (backward) return transitionAnimation(keyframes, type, false);
          return { name: '__marp_collab_transition_no_animation__' };
        }

        function transitionDefaultDuration(keyframes, direction) {
          var target = keyframes[direction];
          var duration =
            (target.both && target.both.duration) ||
            (target.outgoing && target.outgoing.duration) ||
            (target.incoming && target.incoming.duration);
          if (duration || direction === 'forward') return duration;
          return transitionDefaultDuration(keyframes, 'forward');
        }

        function slideTransition(slide, backward) {
          if (!slide) return null;
          var attribute = backward ? 'data-transition-back' : 'data-transition';
          var section = slide.matches('section[' + attribute + ']')
            ? slide
            : slide.querySelector('section[' + attribute + ']');
          if (!section) return null;
          var data;
          try {
            data = JSON.parse(section.getAttribute(attribute));
          } catch (e) {
            return null;
          }
          if (!data || typeof data.name !== 'string' || !NAME_PATTERN.test(data.name)) return null;
          if (data.name === 'none') return null;
          var keyframes =
            resolveTransitionKeyframes(data.name) ||
            (data.builtinFallback ? resolveTransitionKeyframes('__builtin__' + data.name) : null);
          if (!keyframes) return null;
          if (reducedMotion.matches) keyframes = REDUCED_TRANSITION;
          var duration =
            typeof data.duration === 'string' && DURATION_PATTERN.test(data.duration)
              ? data.duration
              : transitionDefaultDuration(keyframes, backward ? 'backward' : 'forward');
          return { keyframes: keyframes, duration: duration };
        }

        function transitionRule(selector, animation) {
          return (
            selector + '{--marp-collab-transition-name:' + animation.name + ';' +
            '--marp-collab-transition-direction:' + (animation.reverse ? 'reverse' : 'normal') + ';}'
          );
        }

        function navigate(index) {
          var next = clamp(index);
          var backward = next < active;
          var transition =
            interactive && next !== active && typeof document.startViewTransition === 'function'
              ? slideTransition(slides[active], backward)
              : null;
          if (!transition) {
            if (currentTransition) currentTransition.skipTransition();
            apply(index);
            return;
          }

          transitionStyle.textContent =
            ':root{--marp-transition-direction:' + (backward ? -1 : 1) + ';}' +
            (transition.duration
              ? '::view-transition-group(root){--marp-collab-transition-duration:' + transition.duration + ';}'
              : '') +
            transitionRule('::view-transition-old(root)', transitionAnimation(transition.keyframes, 'outgoing', backward)) +
            transitionRule('::view-transition-new(root)', transitionAnimation(transition.keyframes, 'incoming', backward));

          var viewTransition;
          try {
            // Starting a new transition skips one that is still running. A skipped transition
            // still runs its update late, so apply the latest requested slide, not this one.
            viewTransition = document.startViewTransition(function () {
              apply(desired);
            });
          } catch (e) {
            transitionStyle.textContent = '';
            apply(index);
            return;
          }
          currentTransition = viewTransition;
          viewTransition.finished.finally(function () {
            if (currentTransition !== viewTransition) return;
            currentTransition = null;
            transitionStyle.textContent = '';
          });
        }

        function updateContent(html, css) {
          // Rebuilding the deck recreates its image elements. Skip identical updates.
          if (html === lastHtml && css === lastCss) {
            return;
          }
          lastHtml = html;
          // Re-parsing unchanged styles would reload embedded theme fonts on every keystroke.
          if (css !== lastCss) {
            lastCss = css;
            document.getElementById('marp-theme').textContent = css;
            transitionKeyframes = null;
          }
          content.innerHTML = html;
          slides = collectSlides();
          zoom = 1;
          zoomOriginX = 50;
          zoomOriginY = 50;
          apply(desired);
          reportZoom();
        }

        window.addEventListener('resize', function () {
          var slide = slides[active];
          if (!slide) return;
          fit(slide);
          applyZoom();
        });

        window.addEventListener('wheel', function (e) {
          if (!interactive || !e.ctrlKey) return;
          e.preventDefault();

          var slide = slides[active];
          if (slide) {
            var rect = slide.getBoundingClientRect();
            zoomOriginX = ((e.clientX - rect.left) / rect.width) * 100;
            zoomOriginY = ((e.clientY - rect.top) / rect.height) * 100;
          }

          var delta = -e.deltaY * 0.005;
          zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
          applyZoom();
          reportZoom();
        }, { passive: false });

        window.addEventListener('dblclick', function (e) {
          if (!interactive || zoom === 1) return;
          e.preventDefault();
          resetZoom();
        });

        // Forward keys because events inside the iframe never reach presentation shortcuts.
        function forwardKey(event) {
          if (interactive && port) port.postMessage(slideFrameKeyMessage(event, true));
        }

        window.addEventListener('keydown', forwardKey);
        window.addEventListener('keyup', forwardKey);

        // Use local pixels for immediate feedback and slide-relative percentages across windows.
        var laser = document.createElement('div');
        laser.style.cssText = 'position:fixed;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle, #ff6b6b 0%, #f00 45%, rgba(255,0,0,0) 72%);box-shadow:0 0 14px 5px rgba(255,0,0,0.55);pointer-events:none;z-index:2147483647;display:none;';
        document.body.appendChild(laser);

        var laserActive = false;
        var laserX = -1;
        var laserY = -1;
        var lastLaserReportTime = 0;
        var laserReportTimer = null;
        var LASER_REPORT_INTERVAL_MS = 50;

        function updateLaser() {
          var visible = laserActive && laserX >= 0;
          laser.style.display = visible ? 'block' : 'none';
          laser.style.transform = 'translate(' + laserX + 'px,' + laserY + 'px)';
          document.documentElement.style.cursor = laserActive ? 'none' : '';
          document.body.style.cursor = laserActive ? 'none' : '';
        }

        function sendLaserReport() {
          if (!port) return;
          var visible = laserActive && laserX >= 0;
          var xPercent = -1;
          var yPercent = -1;
          var slide = slides[active];
          if (visible && slide) {
            var rect = slide.getBoundingClientRect();
            xPercent = ((laserX - rect.left) / rect.width) * 100;
            yPercent = ((laserY - rect.top) / rect.height) * 100;
          }
          port.postMessage({
            type: 'presentation-laser-report',
            active: visible,
            xPercent: xPercent,
            yPercent: yPercent,
          });
        }

        // Throttle mousemove reports to limit WebSocket traffic.
        function reportLaser() {
          var now = Date.now();
          var elapsed = now - lastLaserReportTime;
          if (elapsed >= LASER_REPORT_INTERVAL_MS) {
            lastLaserReportTime = now;
            sendLaserReport();
            return;
          }
          if (laserReportTimer) return;
          laserReportTimer = setTimeout(function () {
            laserReportTimer = null;
            lastLaserReportTime = Date.now();
            sendLaserReport();
          }, LASER_REPORT_INTERVAL_MS - elapsed);
        }

        window.addEventListener('mousemove', function (e) {
          if (!interactive) return;
          laserX = e.clientX;
          laserY = e.clientY;
          laserActive = e.shiftKey;
          updateLaser();
          reportLaser();
        });

        document.addEventListener('mouseleave', function () {
          laserX = -1;
          laserY = -1;
          updateLaser();
          sendLaserReport();
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
            if (laserActive) {
              var slide = slides[active];
              if (slide && typeof data.xPercent === 'number' && data.xPercent >= 0) {
                var rect = slide.getBoundingClientRect();
                laserX = rect.left + (data.xPercent / 100) * rect.width;
                laserY = rect.top + (data.yPercent / 100) * rect.height;
              } else {
                laserActive = false;
              }
            }
            updateLaser();
            return;
          }
          if (data.type === 'presentation-zoom') {
            zoom = Number(data.zoom) || 1;
            zoomOriginX = Number(data.originX);
            zoomOriginY = Number(data.originY);
            if (!isFinite(zoomOriginX)) zoomOriginX = 50;
            if (!isFinite(zoomOriginY)) zoomOriginY = 50;
            applyZoom();
            return;
          }
          if (data.type === 'marp-update') {
            updateContent(data.html, data.css);
            return;
          }
          if (data.type !== 'presentation-set-slide') {
            return;
          }
          desired = Number(data.index) || 0;
          navigate(desired);
        }

        ${SLIDE_FRAME_BRIDGE_SCRIPT}
        listenForSlideFramePort(handlePortMessage, report);
      })();
    </script>
  </body>
</html>`;

export type ZoomState = { zoom: number; originX: number; originY: number };
export type LaserState = { active: boolean; xPercent: number; yPercent: number };

const DEFAULT_ZOOM_STATE: ZoomState = { zoom: 1, originX: 50, originY: 50 };
const DEFAULT_LASER_STATE: LaserState = { active: false, xPercent: -1, yPercent: -1 };

type SlideFrameProps = {
	title: string;
	html: string;
	css: string;
	slideIndex: number;
	/** Non-interactive frames (thumbnails) skip zoom, laser pointer and key forwarding. */
	interactive?: boolean;
	zoomState?: ZoomState;
	onZoomChange?: (state: ZoomState) => void;
	laserState?: LaserState;
	onLaserChange?: (state: LaserState) => void;
	onMetaChange?: (meta: { active: number; total: number }) => void;
	className?: string;
};

function SlideFrame({
	title,
	html,
	css,
	slideIndex,
	interactive = true,
	zoomState = DEFAULT_ZOOM_STATE,
	onZoomChange,
	laserState = DEFAULT_LASER_STATE,
	onLaserChange,
	onMetaChange,
	className,
}: SlideFrameProps) {
	const { port, load, connect } = useSlideFrameBridge((event) => {
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

		if (payload.type === "presentation-zoom-report") {
			const originX = Number(payload.originX);
			const originY = Number(payload.originY);
			onZoomChange?.({
				zoom: Number(payload.zoom) || 1,
				originX: Number.isFinite(originX) ? originX : 50,
				originY: Number.isFinite(originY) ? originY : 50,
			});
			return;
		}

		if (payload.type === "presentation-laser-report") {
			onLaserChange?.({
				active: !!payload.active,
				xPercent: Number(payload.xPercent),
				yPercent: Number(payload.yPercent),
			});
			return;
		}

		dispatchSlideFrameKey(payload);
	});

	const frameConfig = { type: "presentation-config", interactive } as const;
	const frameSlide = { type: "presentation-set-slide", index: slideIndex } as const;
	const frameZoom = { type: "presentation-zoom", ...zoomState } as const;
	const frameLaser = { type: "presentation-laser", ...laserState } as const;

	const handleFrameLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
		const connection = connect(event);
		if (!connection) {
			return;
		}
		// The document needs the requested slide and view state before the first content update.
		connection.postMessage(frameConfig);
		connection.postMessage(frameSlide);
		connection.postMessage(frameZoom);
		connection.postMessage(frameLaser);
	};

	useEffect(() => {
		port.current?.postMessage({ type: "marp-update", html, css });
	}, [load, port, html, css]);

	useEffect(() => {
		port.current?.postMessage({ type: "presentation-config", interactive });
	}, [port, interactive]);

	useEffect(() => {
		port.current?.postMessage({ type: "presentation-set-slide", index: slideIndex });
	}, [port, slideIndex]);

	useEffect(() => {
		port.current?.postMessage({ type: "presentation-zoom", ...zoomState });
	}, [port, zoomState]);

	useEffect(() => {
		port.current?.postMessage({ type: "presentation-laser", ...laserState });
	}, [port, laserState]);

	return (
		<iframe
			title={title}
			srcDoc={staticSrcDoc}
			className={className ?? "h-full w-full border-0"}
			sandbox="allow-scripts"
			onLoad={handleFrameLoad}
		/>
	);
}

export function PresentationFrame({
	markdown,
	slides,
	slideIndex,
	onMetaChange,
	zoomState,
	onZoomChange,
	laserState,
	onLaserChange,
	presenterUsers = [],
	showSpeakerNotes = false,
	demoActive = false,
	demoContainer = null,
	onDemoStart,
	onDemoEnd,
	onToggleFullscreen,
	onHasSpeakerNotesChange,
	className,
}: PresentationFrameProps) {
	const sectionMarkerSlides = useMemo(
		() =>
			"slideSource" in slides
				? getSectionMarkerSlides(markdown, slides.slideSource)
				: new Set<number>(),
		[markdown, slides],
	);
	const slideComments = (index: number) =>
		(slides.comments[index] ?? []).slice(sectionMarkerSlides.has(index) ? 1 : 0);
	const activeComments = parseSlidePresenterComments(slideComments(slideIndex));
	const nextComments = parseSlidePresenterComments(slideComments(slideIndex + 1));
	const nextPresenterChange = getNextPresenterChange(
		activeComments.presenter,
		nextComments.presenter,
	);
	const activePresenterImage = findPresenterImage(activeComments.presenter, presenterUsers);
	const hasSpeakerNotes = activeComments.speakerNotes.length > 0;
	useEffect(() => {
		onHasSpeakerNotesChange?.(hasSpeakerNotes);
	}, [hasSpeakerNotes, onHasSpeakerNotesChange]);
	// Marp returns one comment bucket per slide, so this doubles as the slide count.
	const hasNextSlide = slideIndex + 1 < slides.comments.length;

	const slide = (
		<SlideFrame
			title="Presentation"
			html={slides.html}
			css={slides.css}
			slideIndex={slideIndex}
			zoomState={zoomState}
			onZoomChange={onZoomChange}
			laserState={laserState}
			onLaserChange={onLaserChange}
			onMetaChange={onMetaChange}
			className={
				showSpeakerNotes
					? "h-full w-full border-0 bg-black"
					: (className ?? "h-full w-full border-0")
			}
		/>
	);

	if (!showSpeakerNotes) {
		// Always return the fragment so toggling the demo doesn't remount the slide iframe.
		return (
			<>
				{slide}
				{demoActive && (
					<div className="absolute inset-0 z-40 flex select-none flex-col items-center justify-center gap-4 bg-black px-8 text-center text-white">
						<span className="flex items-center gap-2 text-sm font-medium tracking-widest text-white/70 uppercase">
							<span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
							Live demo
						</span>
						{activeComments.demo && (
							<p className="max-w-4xl text-4xl font-semibold tracking-tight">
								{activeComments.demo}
							</p>
						)}
					</div>
				)}
			</>
		);
	}

	return (
		<div className={className ?? "h-full w-full"}>
			<div className="grid h-full w-full grid-cols-1 gap-3  p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,24vw)]">
				<div className="hidden min-h-0 overflow-hidden rounded-md border border-white/10 shadow-2xl md:block">
					{slide}
				</div>
				<div className="flex min-h-0 flex-col gap-3">
					{activeComments.presenter && (
						<Card
							aria-label="Presenter"
							aria-live="polite"
							className="relative shrink-0 overflow-hidden border-primary/20 bg-linear-to-br from-primary/15 via-card to-card py-0 shadow-2xl"
						>
							<div className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full bg-primary/10 blur-2xl" />
							<CardContent className="relative px-4 py-4">
								<div className="flex items-center gap-3">
									<Avatar size="lg" className="shadow-sm after:border-primary/20">
										{activePresenterImage && (
											<AvatarImage
												src={activePresenterImage}
												alt={`${activeComments.presenter} avatar`}
											/>
										)}
										<AvatarFallback className="bg-primary text-primary-foreground">
											<Mic2Icon className="size-5" aria-hidden />
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0">
										<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
											Now presenting
										</p>
										<p className="truncate text-xl font-semibold tracking-tight">
											{activeComments.presenter}
										</p>
									</div>
								</div>
								{nextPresenterChange && (
									<div className="mt-4 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm">
										<ArrowRightIcon className="size-4 shrink-0 text-primary" aria-hidden />
										<span className="text-muted-foreground">Up next</span>
										<span className="truncate font-semibold">{nextPresenterChange}</span>
									</div>
								)}
							</CardContent>
						</Card>
					)}
					{(activeComments.demo !== null || demoActive) && (
						<Card
							aria-label="Live demo"
							className="shrink-0 gap-0 border-red-500/30 bg-red-500/5 py-0 shadow-2xl"
						>
							<CardContent className="flex items-center gap-3 px-4 py-3">
								<LaptopIcon className="size-5 shrink-0 text-red-500" aria-hidden />
								<div className="min-w-0 flex-1">
									<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
										{demoActive ? "Demo running" : "Live demo"}
									</p>
									<p className="truncate text-sm font-semibold">
										{activeComments.demo || "Demo slide"}
									</p>
								</div>
								{demoActive
									? onDemoEnd && (
											<Button
												type="button"
												size="sm"
												variant="secondary"
												onClick={() => onDemoEnd({ advance: false })}
											>
												End (L)
											</Button>
										)
									: onDemoStart && (
											<Button type="button" size="sm" onClick={onDemoStart}>
												Start (L)
											</Button>
										)}
							</CardContent>
						</Card>
					)}
					<Card className="hidden shrink-0 flex-col overflow-hidden py-0 shadow-2xl md:flex gap-0">
						<CardHeader className="shrink-0 border-b border-border px-4 py-3">
							<CardTitle>Next slide</CardTitle>
						</CardHeader>
						<CardContent className="relative aspect-video px-0">
							{/* Kept mounted past the last slide so stepping back doesn't reload the iframe. */}
							<SlideFrame
								title="Next slide preview"
								html={slides.html}
								css={slides.css}
								slideIndex={slideIndex + 1}
								interactive={false}
								className="pointer-events-none h-full w-full rounded-b-lg border-0 bg-black"
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
									{activeComments.speakerNotes.map((comment, index) => {
										return (
											<p className="whitespace-pre-wrap" key={`${index}-${comment}`}>
												{comment}
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
			{demoContainer && onDemoEnd && (
				<DemoControls
					container={demoContainer}
					title={activeComments.demo}
					speakerNotes={activeComments.speakerNotes}
					slideLabel={`Slide ${slideIndex + 1} of ${slides.comments.length}`}
					hasNextSlide={hasNextSlide}
					onEnd={onDemoEnd}
					onToggleFullscreen={onToggleFullscreen}
				/>
			)}
		</div>
	);
}
