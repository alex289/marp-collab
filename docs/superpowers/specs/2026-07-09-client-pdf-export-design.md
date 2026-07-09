# Client-side hybrid PDF export

## Goal

Export the active Marp deck as a downloaded PDF without a backend renderer, Marp CLI, headless Chromium, or the browser print dialog. The result must match the editor preview closely while retaining a searchable and copyable text layer.

## Scope

- Export the currently selected Markdown deck from the editor.
- Render entirely in the browser, using the same `@marp-team/marp-core` HTML and CSS already used by the preview.
- Preserve relative project assets and project themes through the existing URL rewrite and theme registration paths.
- Download a PDF named after the presentation.
- Keep the normal export action responsive, with a visible in-progress state and a recoverable error message.

## Chosen design

### Hybrid PDF

Each Marp slide is rendered in an off-screen export container at its natural dimensions. `html-to-image` captures that container to a high-resolution PNG. `pdf-lib` creates one PDF page per slide and draws the PNG across the complete page.

The exporter walks text nodes inside the rendered slide and records their client rectangles relative to the slide. It then draws their contents with PDF's invisible text rendering mode. This makes text searchable and copyable without changing the visual pixels. A bundled Geist WOFF2 font is embedded through `@pdf-lib/fontkit`, so Unicode text is preserved instead of being limited to a PDF standard font encoding.

### Component boundaries

- `frontend/src/lib/pdf-export.ts` owns the off-screen rendering, slide capture, DOM-text extraction, font embedding, PDF assembly, download, and cleanup. It accepts rendered Marp HTML/CSS and has no React dependency.
- `frontend/src/components/preview-pane.tsx` supplies the current `rendered` output and presentation name to the exporter. It only owns button state and error feedback.
- `e2e/tests/main.test.ts` verifies that the visible editor action produces a non-empty PDF download.

### Export flow

1. The user clicks **Export PDF** in the preview card.
2. The preview component calls `exportMarpPdf({ html, css, filename })` and disables the button until it settles.
3. The exporter appends a fixed-size, non-visible-but-renderable container to `document.body`, inserts the Marp CSS and HTML, and waits for `document.fonts.ready` plus all slide images.
4. For each Marp SVG slide, the exporter captures a PNG at 2x pixel density, adds a landscape or portrait PDF page matching the slide's dimensions, and places the PNG at page bounds.
5. The exporter derives text fragments from DOM ranges, maps browser coordinates into PDF points, and writes them with `TextRenderingMode.Invisible` using embedded Geist.
6. The exporter saves the PDF to a Blob, triggers a temporary anchor download, revokes the object URL, and always removes the export container.

## Error handling

- An empty slide set rejects with a clear error before PDF creation.
- Missing image loads reject before rendering instead of silently producing a partial PDF.
- A failed export leaves the editor usable, re-enables the action, and shows the existing toast-based error feedback.
- The export container and temporary object URL are cleaned up in `finally` paths.

## Non-goals

- No backend PDF endpoint or persistence of generated PDFs.
- No browser print dialog.
- No speaker notes, handouts, bookmarks, tagged-PDF accessibility tree, or PDF/A conformance in this iteration.
- No guarantee that the background remains vector graphics; visual fidelity takes precedence while the overlay supplies search and copy semantics.

## Verification

- Unit-test pure text-fragment and filename helpers where the existing frontend test setup permits it.
- Add a Playwright editor test that creates a presentation, uses the new action, receives a `.pdf` download, and checks the downloaded stream starts with the PDF header.
- Run formatting, type checking, linting, the backend unit tests, and the focused Playwright test.
