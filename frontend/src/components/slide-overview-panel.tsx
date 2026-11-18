import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { renderMarp } from "@/lib/marp";
import { useSlideTailwindReady } from "@/hooks/use-slide-tailwind-ready";
import {
	editSlideDeck,
	getEditableSlideDeck,
	getInheritedDirectiveConflict,
	getSlideNavigationLines,
	getSlideSections,
	type SlideAction,
	type SlideEdit,
} from "@/lib/slide-blocks";
import { SlideOverviewActions, type ThumbnailMenu } from "./slide-overview-actions";
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
	/** Caret line in the rendered Markdown, or null when another file is open. */
	activeLine: number | null;
	canEdit: boolean;
	editHint: string;
	onSelectLine: (line: number) => void;
	onEdit: (source: string, fileId: string | null, edit: SlideEdit, settings: string) => boolean;
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
      var revision = 0;
      var canReorder = false;
      var activeIndex = -1;
      var selected = null;
      var slides = [];
      var labels = [];
      var sectionHeaders = [];
      var pressIndex = -1;
      var pointerId = null;
      var pressTarget = null;
      var pressY = 0;
      var pressScrollY = 0;
      var dragging = false;
      var dragAllowed = false;

      function post(message) {
        if (port) port.postMessage(Object.assign({ revision: revision }, message));
      }

      function activate(index, range) {
        post({ type: selected ? 'overview-slide-select' : 'overview-slide-click', index: index, range: range });
      }

      function build(html, sections) {
        var stage = document.getElementById('stage');
        stage.innerHTML = html;

        var grid = stage.querySelector('div.marpit') || stage;
        grid.classList.add('thumb-grid');

        slides = Array.from(grid.querySelectorAll(':scope > svg[data-marpit-svg], :scope > section'));
        labels = [];
        sectionHeaders = [];

        slides.forEach(function (slide, index) {
          var section = sections[index];
          if (section) {
            var header = document.createElement('button');
            header.type = 'button';
            header.className = 'section-header';
            header.dataset.start = String(index);
            header.dataset.end = String(section.end);
            header.textContent = section.name;
            header.addEventListener('click', function () {
              post({ type: selected ? 'overview-section-select' : 'overview-slide-click', index: index });
            });
            sectionHeaders.push(header);
            grid.insertBefore(header, slide);
          }

          // Thumbnail artwork is separate from the controls around it.
          slide.querySelectorAll('a, [tabindex]').forEach(function (element) {
            element.setAttribute('tabindex', '-1');
          });
          slide.addEventListener('click', function (event) { event.preventDefault(); });
          slide.classList.add('thumb-slide');
          slide.setAttribute('data-index', String(index));
          var label = document.createElement('button');
          label.type = 'button';
          label.className = 'thumb-label';
          label.setAttribute('data-index', String(index));
          if (canReorder) label.setAttribute('aria-keyshortcuts', 'Shift+F10');
          label.textContent = String(index + 1);
          label.addEventListener('click', function (e) {
            if (e.detail === 0) activate(index, e.shiftKey);
          });
          labels.push(label);
          grid.insertBefore(label, slide);
        });
      }

      function paintActive() {
        var selectedSet = new Set(selected);
        slides.forEach(function (slide, index) {
          slide.classList.toggle('is-active', index === activeIndex);
          slide.classList.toggle('is-selected', selectedSet.has(index));
        });
        labels.forEach(function (label, index) {
          label.classList.toggle('is-active', index === activeIndex);
          label.setAttribute('aria-label', (selected ? 'Select slide ' : 'Jump to slide ') + (index + 1));
          if (selected) label.setAttribute('aria-pressed', String(selectedSet.has(index)));
          else label.removeAttribute('aria-pressed');
          if (index === activeIndex) label.setAttribute('aria-current', 'true');
          else label.removeAttribute('aria-current');
        });
        sectionHeaders.forEach(function (header) {
          header.setAttribute('aria-label', (selected ? 'Select section ' : 'Jump to section ') + header.textContent);
          if (!selected) {
            header.removeAttribute('aria-pressed');
            return;
          }
          var start = Number(header.dataset.start);
          var end = Number(header.dataset.end);
          var count = 0;
          for (var index = start; index < end; index++) {
            if (selectedSet.has(index)) count++;
          }
          header.setAttribute('aria-pressed', count === 0 ? 'false' : (
            count === end - start ? 'true' : 'mixed'
          ));
        });
      }

      function revealActive() {
        var target = slides[activeIndex];
        if (!target) return;

        var rect = target.getBoundingClientRect();
        if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;

        target.scrollIntoView({ block: 'nearest' });
      }

      function elementWithIndex(node) {
        while (node && node !== document.body) {
          var index = node.getAttribute && node.getAttribute('data-index');
          if (index !== null && (slides[index] === node || labels[index] === node)) return node;
          node = node.parentNode;
        }
        return null;
      }

      function openContextMenu(element, x, y, keyboard) {
        post({
          type: 'overview-slide-contextmenu',
          index: Number(element.dataset.index),
          x: x,
          y: y,
          keyboard: keyboard,
        });
      }

      document.addEventListener('contextmenu', function (e) {
        if (!canReorder) return;
        var element = elementWithIndex(e.target);
        if (!element) return;
        e.preventDefault();
        openContextMenu(element, e.clientX, e.clientY, false);
      });

      // Returns the insertion slot (0..count) the pointer currently sits in.
      // The lifted slide rides along with the cursor, so its own rect says
      // nothing about where the drop belongs and has to be ignored.
      function slotFromPoint(y) {
        for (var i = 0; i < slides.length; i++) {
          if (dragging && i === pressIndex) continue;
          var rect = slides[i].getBoundingClientRect();
          if (y < rect.top + rect.height / 2) return i;
        }
        return slides.length;
      }

      function paintDropSlot(slot) {
        var moving = selected && selected.includes(pressIndex) ? selected : [pressIndex];
        var target = slot - moving.filter(function (index) { return index < slot; }).length;
        var settled = moving.every(function (index, position) { return index === target + position; });
        // Moving down into a section boundary lands at the end of the section
        // above it, so the line is drawn above that section's name.
        var endOfSection = slot === slides.length || (
          target > moving[0] &&
          sectionHeaders.some(function (header) { return Number(header.dataset.start) === slot; })
        );

        slides.forEach(function (slide, index) {
          slide.classList.toggle('drop-before', !settled && !endOfSection && index === slot);
          slide.classList.toggle('drop-after', !settled && endOfSection && index === slot - 1);
        });
      }

      function liftDragged(offset) {
        var slide = slides[pressIndex];
        if (slide) slide.style.setProperty('--drag-offset', offset + 'px');
      }

      function clearDrag() {
        document.body.classList.remove('is-dragging');
        slides.forEach(function (slide) {
          slide.classList.remove('drop-before', 'drop-after', 'is-dragged');
          slide.style.removeProperty('--drag-offset');
        });
        labels.forEach(function (label) {
          label.classList.remove('is-dragged-label');
        });
        if (pointerId !== null && pressTarget?.hasPointerCapture(pointerId)) {
          pressTarget.releasePointerCapture(pointerId);
        }
        pointerId = null;
        pressTarget = null;
        pressIndex = -1;
        dragging = false;
        dragAllowed = false;
      }

      document.addEventListener('pointerdown', function (e) {
        if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;

        var element = elementWithIndex(e.target);
        if (!element) return;

        pointerId = e.pointerId;
        pressTarget = element;
        pressTarget.setPointerCapture(pointerId);
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
          if (e.pointerId !== pointerId || !dragAllowed) return;

          if (!dragging) {
            if (Math.abs(e.clientY - pressY) < 6) return;
            dragging = true;
            document.body.classList.add('is-dragging');
            slides[pressIndex].classList.add('is-dragged');
            labels[pressIndex].classList.add('is-dragged-label');
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
        if (e.pointerId !== pointerId) return;

        var from = pressIndex;
        var slot = dragging ? slotFromPoint(e.clientY) : -1;
        var wasDragging = dragging;
        clearDrag();

        if (!wasDragging) {
          var released = elementWithIndex(document.elementFromPoint(e.clientX, e.clientY));
          if (Number(released?.dataset.index) === from) activate(from, e.shiftKey);
          return;
        }

        if (e.clientX >= 0 && e.clientX < window.innerWidth && e.clientY >= 0 && e.clientY < window.innerHeight) {
          post({ type: 'overview-slide-move', from: from, slot: slot });
        }
      });

      function cancelPointer(e) {
        if (e.pointerId === pointerId) clearDrag();
      }

      document.addEventListener('pointercancel', cancelPointer);
      document.addEventListener('lostpointercapture', cancelPointer);
      window.addEventListener('blur', clearDrag);

      // Images inside a slide are still natively draggable, which would spawn a
      // ghost image and swallow the reorder gesture.
      document.addEventListener('dragstart', function (e) {
        e.preventDefault();
      });

      // Key events inside an iframe don't reach the parent document, so page
      // hotkeys would die once a thumbnail has focus. Mirrors the preview pane.
      function forwardKey(type) {
        return function (e) {
          if (canReorder && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
            var element = elementWithIndex(e.target);
            if (element) {
              e.preventDefault();
              if (type === 'keydown' && !e.repeat) {
                var rect = element.getBoundingClientRect();
                openContextMenu(element, rect.right, rect.bottom, true);
              }
              return;
            }
          }
          if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
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
          clearDrag();
          revision = e.data.revision;
          canReorder = e.data.canReorder;
          activeIndex = e.data.activeIndex;
          selected = e.data.selected;
          document.getElementById('overview-styles').textContent = e.data.css;
          document.body.classList.toggle('can-reorder', canReorder);
          build(e.data.html, e.data.sections);
          paintActive();
          revealActive();
          return;
        }

        if (e.data.type === 'overview-set-state' && e.data.revision === revision) {
          var activeChanged = activeIndex !== e.data.activeIndex;
          activeIndex = e.data.activeIndex;
          selected = e.data.selected;
          paintActive();
          if (activeChanged && !dragging) revealActive();
        }

        if (e.data.type === 'overview-focus-slide' && e.data.revision === revision) {
          labels[e.data.index]?.focus({ preventScroll: true });
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
	activeLine,
	canEdit,
	editHint,
	onSelectLine,
	onEdit,
}: SlideOverviewPanelProps) => {
	const { resolvedTheme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const portRef = useRef<MessagePort | null>(null);
	const revision = useRef(0);
	const [iframeLoad, setIframeLoad] = useState(0);
	const [selection, setSelection] = useState<{
		shape: string;
		indices: number[];
		anchor: number | null;
	} | null>(null);
	const [thumbnailMenu, setThumbnailMenu] = useState<(ThumbnailMenu & { shape: string }) | null>(
		null,
	);

	const slideTailwindReady = useSlideTailwindReady();
	const rendered = useMemo(() => {
		// Project themes live on the shared Marp instance; this invalidates stale renders.
		// Decks using Tailwind render once more after its lazily loaded compiler is ready.
		void themeRevision;
		void slideTailwindReady;
		try {
			return renderMarp(markdown, projectId, deckFileId, assetRevision, assetToken);
		} catch {
			return null;
		}
	}, [
		markdown,
		projectId,
		deckFileId,
		themeRevision,
		slideTailwindReady,
		assetRevision,
		assetToken,
	]);

	const deck = useMemo(
		() => rendered && getEditableSlideDeck(markdown, rendered.slideSource),
		[markdown, rendered],
	);
	const sections = useMemo(() => (deck ? getSlideSections(deck) : []), [deck]);
	const slideLines = useMemo(
		() => (rendered ? getSlideNavigationLines(markdown, rendered.slideSource) : []),
		[markdown, rendered],
	);
	const slideCount = slideLines.length;
	let activeIndex = activeLine === null ? -1 : 0;
	if (activeLine !== null) {
		for (let index = 1; index < slideCount && slideLines[index] <= activeLine; index += 1) {
			activeIndex = index;
		}
	}
	const editable = canEdit && deck !== null;
	// Selections, menus and forms outlive edits that keep the slides in place,
	// such as a collaborator typing, and reset once slides are added or removed.
	const shapeOf = (count: number) => `${deckFileId}\n${count}`;
	const deckShape = shapeOf(slideCount);
	const currentSelection = editable && selection?.shape === deckShape ? selection : null;
	if (selection && !currentSelection) {
		setSelection(null);
	}
	const selected = currentSelection?.indices ?? null;
	const currentThumbnailMenu =
		editable && thumbnailMenu?.shape === deckShape ? thumbnailMenu : null;
	if (thumbnailMenu && !currentThumbnailMenu) {
		setThumbnailMenu(null);
	}

	function changeSelection(indices: number[] | null, anchor: number | null = null) {
		setSelection(indices && { shape: deckShape, indices, anchor });
	}

	function applyAction(action: SlideAction) {
		if (!editable || !deck || !rendered) {
			return;
		}
		if (getInheritedDirectiveConflict(deck, action)) {
			toast.error(
				"A slide in this edit sets a directive that later slides inherit, like paginate or class. Edit the Markdown directly.",
			);
			return;
		}
		const edit = editSlideDeck(deck, action);
		if (!edit || !onEdit(markdown, deckFileId, edit, rendered.slideSettings)) {
			return;
		}

		if (selected && action.type === "move") {
			setSelection({
				shape: shapeOf(edit.slideCount),
				indices: action.indices.map((_, offset) => edit.index + offset),
				anchor: edit.index,
			});
		} else {
			setSelection(null);
		}
	}

	const frameState = useRef({ activeIndex, selected });
	const messageHandler = useRef<((event: MessageEvent) => void) | null>(null);
	useEffect(() => {
		frameState.current = { activeIndex, selected };
		messageHandler.current = (event) => {
			const payload = event.data;
			if (payload?.revision !== revision.current) {
				return;
			}

			if (payload.type === "presentation-key") {
				if (
					(payload.eventType !== "keydown" && payload.eventType !== "keyup") ||
					typeof payload.key !== "string" ||
					typeof payload.code !== "string"
				) {
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
				return;
			}

			if (
				payload.type === "overview-slide-move" &&
				Number.isInteger(payload.from) &&
				slideLines[payload.from] !== undefined &&
				Number.isInteger(payload.slot)
			) {
				const indices = selected?.includes(payload.from) ? selected : [payload.from];
				applyAction({ type: "move", indices, slot: payload.slot });
				return;
			}

			const index: number = payload.index;
			if (!Number.isInteger(index) || slideLines[index] === undefined) {
				return;
			}

			if (payload.type === "overview-slide-contextmenu") {
				const frame = iframeRef.current;
				const { x, y } = payload;
				if (
					!editable ||
					!frame ||
					!Number.isFinite(x) ||
					!Number.isFinite(y) ||
					x < 0 ||
					y < 0 ||
					x > frame.clientWidth ||
					y > frame.clientHeight
				) {
					return;
				}
				const rect = frame.getBoundingClientRect();
				setThumbnailMenu({
					shape: deckShape,
					index,
					x: rect.left + x,
					y: rect.top + y,
					keyboard: payload.keyboard === true,
					open: true,
				});
				return;
			}

			if (payload.type === "overview-slide-click") {
				onSelectLine(slideLines[index]);
				return;
			}
			if (
				!editable ||
				(payload.type !== "overview-slide-select" && payload.type !== "overview-section-select")
			) {
				return;
			}
			setSelection((previous) => {
				if (previous?.shape !== deckShape) {
					return previous;
				}
				const next = new Set(previous.indices);
				let anchor = index;
				if (payload.type === "overview-section-select") {
					const section = sections.find(({ start }) => start === index);
					if (!section) {
						return previous;
					}
					const group = Array.from(
						{ length: section.end - section.start },
						(_, offset) => index + offset,
					);
					if (group.every((item) => next.has(item))) {
						for (const item of group) {
							next.delete(item);
						}
					} else {
						for (const item of group) {
							next.add(item);
						}
					}
				} else if (payload.range && previous.anchor !== null) {
					anchor = previous.anchor;
					for (let item = Math.min(index, anchor); item <= Math.max(index, anchor); item += 1) {
						next.add(item);
					}
				} else if (!next.delete(index)) {
					next.add(index);
				}
				return { ...previous, indices: [...next].sort((a, b) => a - b), anchor };
			});
		};
	});

	const handleIframeLoad = useCallback(() => {
		portRef.current?.close();
		const channel = new MessageChannel();
		portRef.current = channel.port1;
		channel.port1.onmessage = (event) => messageHandler.current?.(event);
		iframeRef.current?.contentWindow?.postMessage({ type: "init-port" }, "*", [channel.port2]);
		setIframeLoad((load) => load + 1);
	}, []);

	useEffect(() => () => portRef.current?.close(), []);

	useEffect(() => {
		if (!iframeLoad || !rendered || !portRef.current) {
			return;
		}

		// Must mirror index.css; the srcDoc iframe can't read the parent's
		// custom properties. Its own background stays transparent so the
		// thumbnails sit directly on the sidebar; browsers only honour that
		// when the frame's color-scheme matches the page's.
		const isDark = resolvedTheme === "dark";
		const pageShadow = isDark ? "0 1px 6px rgb(0 0 0 / 0.55)" : "0 1px 4px rgb(0 0 0 / 0.18)";
		const liftShadow = isDark ? "0 10px 24px rgb(0 0 0 / 0.7)" : "0 10px 24px rgb(0 0 0 / 0.35)";
		const accent = isDark ? "oklch(0.72 0.15 250)" : "oklch(0.52 0.18 255)";
		const muted = isDark ? "oklch(0.65 0 0)" : "oklch(0.45 0 0)";

		portRef.current.postMessage({
			type: "overview-update",
			revision: ++revision.current,
			...frameState.current,
			canReorder: editable,
			sections: Object.fromEntries(
				sections.filter(({ name }) => name).map((section) => [section.start, section]),
			),
			html: rendered.html,
			css: `
      html, body {
        margin: 0;
        min-height: 100%;
        background: transparent;
        color-scheme: ${resolvedTheme};
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
        grid-template-columns: 1.6rem minmax(0, 1fr);
        align-items: start;
        gap: 10px 6px;
        width: 100%;
        padding: 10px 12px 28px 8px;
      }
      .thumb-grid > .thumb-slide {
        /* Slide artwork renders as in the preview, whatever the app theme. */
        color-scheme: light;
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
      .thumb-grid > .thumb-slide * { pointer-events: none; }
      .thumb-grid > .thumb-slide.is-selected { box-shadow: 0 0 0 3px ${accent}; }
      .thumb-grid > .thumb-slide.is-active { outline-color: ${accent}; }
      .thumb-grid > .thumb-slide.drop-before { box-shadow: 0 -4px 0 -1px ${accent}, ${pageShadow}; }
      .thumb-grid > .thumb-slide.drop-after { box-shadow: 0 4px 0 -1px ${accent}, ${pageShadow}; }
      /* The picked-up slide leaves its slot behind and rides the cursor, so the
         gap it came from stays visible as the drop indicator moves. Listed last
         so the lift wins over any drop-indicator shadow. */
      .thumb-grid > .thumb-slide.is-dragged {
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
      .section-header, .thumb-label {
        border: 0;
        background: transparent;
        color: ${muted};
        font-family: inherit;
        cursor: pointer;
      }
      .section-header:focus-visible, .thumb-label:focus-visible {
        outline: 2px solid ${accent};
        outline-offset: 1px;
      }
      .section-header {
        grid-column: 1 / -1;
        padding: 6px 4px 5px;
        border-bottom: 1px solid color-mix(in srgb, ${muted} 35%, transparent);
        text-align: left;
        font-size: 11px;
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      .thumb-label {
        grid-column: 1;
        display: grid;
        place-items: center;
        min-height: 24px;
        width: 100%;
        padding: 0;
        border-radius: 4px;
        font-size: 10px;
        font-variant-numeric: tabular-nums;
      }
      .thumb-label[aria-pressed] {
        border: 1px solid color-mix(in srgb, ${muted} 50%, transparent);
      }
      .thumb-label[aria-pressed="true"] {
        color: ${accent};
        border-color: ${accent};
        background: color-mix(in srgb, ${accent} 15%, transparent);
        font-weight: 700;
      }
      @media (prefers-reduced-motion: reduce) {
        .thumb-grid > .thumb-slide { transition: none; }
      }
      .thumb-label.is-active { color: ${accent}; font-weight: 600; }
      body.can-reorder .thumb-label { cursor: grab; touch-action: none; }
      body.is-dragging, body.is-dragging .thumb-label { cursor: grabbing; }
    `,
		});
	}, [iframeLoad, rendered, resolvedTheme, editable, sections]);

	useEffect(() => {
		if (!iframeLoad) {
			return;
		}
		portRef.current?.postMessage({
			type: "overview-set-state",
			revision: revision.current,
			activeIndex,
			selected,
		});
	}, [iframeLoad, activeIndex, selected]);

	return (
		<SidebarGroup className="h-full min-h-0">
			<SidebarGroupLabel className="flex shrink-0 items-center gap-2 pb-2 pl-0">
				{!selected && (
					<>
						<LayoutGrid className="size-4" />
						<span>Slides</span>
						{isMarkdown ? (
							<span className="text-muted-foreground tabular-nums">{slideCount}</span>
						) : null}
					</>
				)}
				{isMarkdown && editable && rendered && (
					<SlideOverviewActions
						key={deckFileId}
						deckShape={deckShape}
						slideCount={slideCount}
						activeIndex={Math.max(0, activeIndex)}
						sections={sections}
						selected={selected}
						thumbnailMenu={currentThumbnailMenu}
						iframeRef={iframeRef}
						onCloseThumbnailMenu={() =>
							setThumbnailMenu((menu) => (menu?.open ? { ...menu, open: false } : menu))
						}
						onFocusThumbnail={(index) =>
							portRef.current?.postMessage({
								type: "overview-focus-slide",
								revision: revision.current,
								index,
							})
						}
						onChangeSelection={changeSelection}
						onAction={applyAction}
					/>
				)}
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
							className="min-h-0 w-full flex-1"
							sandbox="allow-scripts"
							onLoad={handleIframeLoad}
						/>
						<p className="shrink-0 px-2 pt-2 text-xs text-center text-muted-foreground">
							{!canEdit
								? editHint
								: !editable
									? "Edit this deck’s slide breaks in the source."
									: selected
										? "Click to select. Shift-click for a range. Drag to move."
										: "Click to jump. Drag to move. Right-click for actions."}
						</p>
					</>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
};
