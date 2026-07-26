import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { renderMarp } from "@/lib/marp";
import { countMarpSlides } from "@/lib/slide-count";
import { useTheme } from "./theme-provider";
import marpitSvgPolyfillScript from "@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw";

type SlideOverviewPanelProps = {
	markdown: string;
	isMarkdown: boolean;
	projectId: string;
	/** Id of the deck being rendered; drives relative asset resolution. */
	deckFileId: string | null;
	themeRevision: number;
	assetRevision: number;
	assetToken?: string;
	/** Slide the editor caret sits on, or null when another file is open. */
	activeSlideIndex: number | null;
	/** False for read-only collaborators and while a non-deck file is open. */
	canReorder: boolean;
	reorderHint: string;
	onSelectSlide: (index: number) => void;
	onMoveSlide: (from: number, to: number) => void;
};

// Marpit scopes its theme CSS with child combinators (`div.marpit > svg > ...`),
// so the slides must stay direct children of the container they were rendered
// in. The number badges are inserted as siblings and the grid places each
// badge/slide pair on one row.
const staticSrcDoc = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style id="overview-styles"></style>
    <script>
      ${marpitSvgPolyfillScript}
    </script>
    <script>
      var port = null;
      var canReorder = false;
      var activeIndex = -1;
      var pressIndex = -1;
      var pressY = 0;
      var pressScrollY = 0;
      var dragging = false;
      var dragAllowed = false;

      function post(message) {
        if (port) port.postMessage(message);
      }

      function slideElements() {
        var grid = document.querySelector('.thumb-grid');
        if (!grid) return [];
        return Array.prototype.slice.call(
          grid.querySelectorAll(':scope > svg[data-marpit-svg], :scope > section')
        );
      }

      function build(html) {
        var stage = document.getElementById('stage');
        stage.innerHTML = html;

        var grid = stage.querySelector('div.marpit') || stage;
        grid.classList.add('thumb-grid');

        var slides = Array.prototype.slice.call(
          grid.querySelectorAll(':scope > svg[data-marpit-svg], :scope > section')
        );

        slides.forEach(function (slide, index) {
          slide.setAttribute('data-index', String(index));
          var label = document.createElement('div');
          label.className = 'thumb-label';
          label.setAttribute('data-index', String(index));
          label.textContent = String(index + 1);
          grid.insertBefore(label, slide);
        });
      }

      function paintActive() {
        slideElements().forEach(function (slide) {
          var index = Number(slide.getAttribute('data-index'));
          slide.classList.toggle('is-active', index === activeIndex);
        });
        Array.prototype.forEach.call(document.querySelectorAll('.thumb-label'), function (label) {
          var index = Number(label.getAttribute('data-index'));
          label.classList.toggle('is-active', index === activeIndex);
        });
      }

      function revealActive() {
        var slides = slideElements();
        var target = slides[activeIndex];
        if (!target) return;

        var rect = target.getBoundingClientRect();
        if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      function elementWithIndex(node) {
        while (node && node !== document.body) {
          if (node.getAttribute && node.getAttribute('data-index') !== null) return node;
          node = node.parentNode;
        }
        return null;
      }

      // Returns the insertion slot (0..count) the pointer currently sits in.
      // The lifted slide rides along with the cursor, so its own rect says
      // nothing about where the drop belongs and has to be ignored.
      function slotFromPoint(y) {
        var slides = slideElements();
        for (var i = 0; i < slides.length; i++) {
          if (dragging && i === pressIndex) continue;
          var rect = slides[i].getBoundingClientRect();
          if (y < rect.top + rect.height / 2) return i;
        }
        return slides.length;
      }

      // Both the slot before and the slot after the dragged slide land it back
      // where it started, so neither should promise a move.
      function paintDropSlot(slot) {
        var slides = slideElements();
        var settled = (slot > pressIndex ? slot - 1 : slot) === pressIndex;

        slides.forEach(function (slide, index) {
          slide.classList.toggle('drop-before', !settled && index === slot);
          slide.classList.toggle(
            'drop-after',
            !settled && slot === slides.length && index === slides.length - 1
          );
        });
      }

      function liftDragged(offset) {
        var slide = slideElements()[pressIndex];
        if (slide) slide.style.setProperty('--drag-offset', offset + 'px');
      }

      function labelFor(index) {
        return document.querySelector('.thumb-label[data-index="' + index + '"]');
      }

      function clearDrag() {
        document.body.classList.remove('is-dragging');
        slideElements().forEach(function (slide) {
          slide.classList.remove('drop-before', 'drop-after', 'is-dragged');
          slide.style.removeProperty('--drag-offset');
        });
        Array.prototype.forEach.call(document.querySelectorAll('.thumb-label'), function (label) {
          label.classList.remove('is-dragged-label');
        });
        pressIndex = -1;
        dragging = false;
        dragAllowed = false;
      }

      document.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;

        var element = elementWithIndex(e.target);
        if (!element) return;

        pressIndex = Number(element.getAttribute('data-index'));
        pressY = e.clientY;
        pressScrollY = window.scrollY;
        dragging = false;
        // Touch drags would fight the panel's own scrolling, so on touch the
        // number badge is the only drag handle.
        dragAllowed =
          canReorder && (e.pointerType !== 'touch' || element.classList.contains('thumb-label'));
      });

      document.addEventListener(
        'pointermove',
        function (e) {
          if (pressIndex < 0 || !dragAllowed) return;

          if (!dragging) {
            if (Math.abs(e.clientY - pressY) < 6) return;
            dragging = true;
            document.body.classList.add('is-dragging');
            var slides = slideElements();
            if (slides[pressIndex]) slides[pressIndex].classList.add('is-dragged');
            var label = labelFor(pressIndex);
            if (label) label.classList.add('is-dragged-label');
          }

          e.preventDefault();

          if (e.clientY < 48) window.scrollBy(0, -14);
          else if (e.clientY > window.innerHeight - 48) window.scrollBy(0, 14);

          // The slide is offset from where it was picked up, so auto-scrolling
          // the list has to be folded in or it drifts away from the cursor.
          liftDragged(e.clientY - pressY + (window.scrollY - pressScrollY));
          paintDropSlot(slotFromPoint(e.clientY));
        },
        { passive: false }
      );

      document.addEventListener('pointerup', function (e) {
        if (pressIndex < 0) return;

        var from = pressIndex;
        var slot = dragging ? slotFromPoint(e.clientY) : -1;
        var wasDragging = dragging;
        clearDrag();

        if (!wasDragging) {
          post({ type: 'overview-slide-click', index: from });
          return;
        }

        // A slot past the dragged slide shifts down once that slide is removed.
        var to = slot > from ? slot - 1 : slot;
        if (to >= 0 && to !== from) {
          post({ type: 'overview-slide-move', from: from, to: to });
        }
      });

      document.addEventListener('pointercancel', clearDrag);

      // Images inside a slide are still natively draggable, which would spawn a
      // ghost image and swallow the reorder gesture.
      document.addEventListener('dragstart', function (e) {
        e.preventDefault();
      });

      // Key events inside an iframe don't reach the parent document, so page
      // hotkeys would die once a thumbnail has focus. Mirrors the preview pane.
      function forwardKey(type) {
        return function (e) {
          post({
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

      function handlePortMessage(e) {
        if (!e.data) return;

        if (e.data.type === 'overview-update') {
          canReorder = e.data.canReorder;
          activeIndex = e.data.activeIndex;
          document.getElementById('overview-styles').textContent = e.data.css;
          document.body.classList.toggle('can-reorder', canReorder);
          build(e.data.html);
          paintActive();
          return;
        }

        if (e.data.type === 'overview-set-active') {
          activeIndex = e.data.activeIndex;
          paintActive();
          if (!dragging) revealActive();
        }
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
  <body><div id="stage"></div></body>
</html>`;

export const SlideOverviewPanel = ({
	markdown,
	isMarkdown,
	projectId,
	deckFileId,
	themeRevision,
	assetRevision,
	assetToken,
	activeSlideIndex,
	canReorder,
	reorderHint,
	onSelectSlide,
	onMoveSlide,
}: SlideOverviewPanelProps) => {
	const { resolvedTheme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const portRef = useRef<MessagePort | null>(null);
	const [iframeReady, setIframeReady] = useState(false);
	const onSelectSlideRef = useRef(onSelectSlide);
	const onMoveSlideRef = useRef(onMoveSlide);
	const activeSlideIndexRef = useRef(activeSlideIndex);

	useEffect(() => {
		onSelectSlideRef.current = onSelectSlide;
		onMoveSlideRef.current = onMoveSlide;
		activeSlideIndexRef.current = activeSlideIndex;
	}, [onSelectSlide, onMoveSlide, activeSlideIndex]);

	const slideCount = useMemo(() => countMarpSlides(markdown), [markdown]);

	const rendered = useMemo(() => {
		// Project themes live on the shared Marp instance; this invalidates stale renders.
		void themeRevision;
		try {
			return renderMarp(markdown, projectId, deckFileId, assetRevision, assetToken);
		} catch {
			return null;
		}
	}, [markdown, projectId, deckFileId, themeRevision, assetRevision, assetToken]);

	const handlePortMessage = useCallback((event: MessageEvent) => {
		const payload = event.data;

		if (payload?.type === "overview-slide-click" && typeof payload.index === "number") {
			onSelectSlideRef.current(payload.index);
			return;
		}

		if (
			payload?.type === "overview-slide-move" &&
			typeof payload.from === "number" &&
			typeof payload.to === "number"
		) {
			onMoveSlideRef.current(payload.from, payload.to);
			return;
		}

		if (payload?.type !== "presentation-key") {
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
		if (!iframeReady || !rendered || !portRef.current) {
			return;
		}

		// Must mirror index.css; the srcDoc iframe can't read the parent's
		// custom properties.
		const isDark = resolvedTheme === "dark";
		const background = isDark ? "oklch(0.14 0 0)" : "oklch(0.92 0 0)";
		const pageShadow = isDark ? "0 1px 6px rgb(0 0 0 / 0.55)" : "0 1px 4px rgb(0 0 0 / 0.18)";
		const liftShadow = isDark ? "0 10px 24px rgb(0 0 0 / 0.7)" : "0 10px 24px rgb(0 0 0 / 0.35)";
		const accent = isDark ? "oklch(0.72 0.15 250)" : "oklch(0.52 0.18 255)";
		const muted = isDark ? "oklch(0.65 0 0)" : "oklch(0.45 0 0)";

		portRef.current.postMessage({
			type: "overview-update",
			activeIndex: activeSlideIndexRef.current ?? -1,
			canReorder,
			html: rendered.html,
			css: `
      html, body {
        margin: 0;
        min-height: 100%;
        background: ${background};
        overflow-x: hidden;
        overflow-y: auto;
        font-family: system-ui, -apple-system, sans-serif;
      }
      *, *::before, *::after { box-sizing: border-box; }
      /* Thumbnails are a navigation surface, not readable text — a drag across
         them must reorder slides, never smear a text selection over the deck. */
      body, body * {
        -webkit-user-select: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      ${rendered.css}
      .thumb-grid {
        display: grid;
        grid-template-columns: 1.25rem minmax(0, 1fr);
        align-items: start;
        gap: 10px 6px;
        width: 100%;
        padding: 10px 12px 28px 8px;
      }
      .thumb-grid > svg[data-marpit-svg],
      .thumb-grid > section {
        grid-column: 2;
        width: 100% !important;
        height: auto !important;
        max-width: 100%;
        border: 0;
        border-radius: 3px;
        box-shadow: ${pageShadow};
        outline: 2px solid transparent;
        outline-offset: 2px;
        cursor: pointer;
        transition: outline-color 120ms ease;
      }
      .thumb-grid > .is-active { outline-color: ${accent}; }
      .thumb-grid > .drop-before { box-shadow: 0 -4px 0 -1px ${accent}, ${pageShadow}; }
      .thumb-grid > .drop-after { box-shadow: 0 4px 0 -1px ${accent}, ${pageShadow}; }
      /* The picked-up slide leaves its slot behind and rides the cursor, so the
         gap it came from stays visible as the drop indicator moves. Listed last
         so the lift wins over any drop-indicator shadow. */
      .thumb-grid > .is-dragged {
        transform: translateY(var(--drag-offset, 0px)) scale(1.04) rotate(-1deg);
        transform-origin: center;
        transition: none;
        position: relative;
        z-index: 2;
        opacity: 0.92;
        outline-color: ${accent};
        box-shadow: ${liftShadow};
      }
      body.is-dragging .thumb-label { opacity: 0.45; }
      body.is-dragging .thumb-label.is-dragged-label {
        opacity: 1;
        color: ${accent};
        font-weight: 600;
      }
      .thumb-label {
        grid-column: 1;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-top: 2px;
        font-size: 10px;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        color: ${muted};
        user-select: none;
        touch-action: none;
        cursor: pointer;
      }
      .thumb-label.is-active { color: ${accent}; font-weight: 600; }
      body.can-reorder .thumb-label { cursor: grab; }
      body.is-dragging, body.is-dragging .thumb-label { cursor: grabbing; }
    `,
		});
	}, [iframeReady, rendered, resolvedTheme, canReorder]);

	useEffect(() => {
		if (!iframeReady || !portRef.current) {
			return;
		}

		portRef.current.postMessage({
			type: "overview-set-active",
			activeIndex: activeSlideIndex ?? -1,
		});
	}, [iframeReady, activeSlideIndex]);

	return (
		<SidebarGroup className="h-full min-h-0">
			<SidebarGroupLabel className="flex shrink-0 items-center gap-2 pb-2 pl-0">
				<LayoutGrid className="size-4" />
				<span>Slides</span>
				{isMarkdown ? <span className="ml-auto text-muted-foreground">{slideCount}</span> : null}
			</SidebarGroupLabel>
			<SidebarGroupContent className="flex min-h-0 flex-1 flex-col">
				{!isMarkdown ? (
					<p className="px-2 text-xs text-muted-foreground">
						Slides are available for Markdown decks.
					</p>
				) : !rendered ? (
					<p className="px-2 text-xs text-muted-foreground">
						This deck can&apos;t be rendered right now. Fix the Marp error in the preview to see
						thumbnails.
					</p>
				) : (
					<>
						<iframe
							ref={iframeRef}
							title="Slide overview"
							srcDoc={staticSrcDoc}
							className="min-h-0 w-full flex-1 rounded-sm"
							sandbox="allow-scripts"
							onLoad={handleIframeLoad}
						/>
						<p className="shrink-0 px-2 pt-2 text-xs text-center text-muted-foreground">
							{reorderHint}
						</p>
					</>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
};
