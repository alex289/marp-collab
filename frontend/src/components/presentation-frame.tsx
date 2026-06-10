import { renderMarp } from "@/lib/marp";
import { useEffect, useMemo, useRef } from "react";

type PresentationFrameProps = {
	markdown: string;
	slideIndex: number;
	onMetaChange?: (meta: { active: number; total: number }) => void;
	className?: string;
};

export function PresentationFrame({
	markdown,
	slideIndex,
	onMetaChange,
	className,
}: PresentationFrameProps) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);

	const rendered = useMemo(() => {
		try {
			return renderMarp(markdown);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Error</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></section>`,
				css: "",
			};
		}
	}, [markdown]);

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

        function apply(index) {
          active = clamp(index);
					slides.forEach(function (slide, i) {
						if (i === active) {
							slide.style.setProperty('display', 'block', 'important');
							slide.style.setProperty('width', '100%', 'important');
							slide.style.setProperty('height', '100%', 'important');
							slide.removeAttribute('aria-hidden');
						} else {
							slide.style.setProperty('display', 'none', 'important');
							slide.setAttribute('aria-hidden', 'true');
						}
          });
          report();
        }

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

	return (
		<iframe
			ref={iframeRef}
			title="Presentation"
			srcDoc={srcDoc}
			className={className ?? "h-full w-full border-0"}
			sandbox="allow-scripts"
		/>
	);
}
