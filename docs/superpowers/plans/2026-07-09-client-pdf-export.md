# Client-side PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor user download the active Marp deck as a visual-fidelity PDF with searchable and copyable text, without a backend renderer or print dialog.

**Architecture:** Render the current Marp HTML/CSS in an off-screen browser container. Capture each slide at 2x density for the page background and overlay its DOM text as invisible, embedded-font PDF text. Keep export mechanics in a framework-independent library and wire a button in `PreviewPane`.

**Tech Stack:** React 19, TypeScript, `@marp-team/marp-core`, `html-to-image`, `pdf-lib`, `@pdf-lib/fontkit`, Playwright.

## Global Constraints

- The export operates entirely in the browser; no backend PDF endpoint, Marp CLI, Chromium worker, or browser print dialog.
- Export only the active Markdown deck and use its current Marp HTML/CSS, custom theme, and rewritten project asset URLs.
- Each slide is captured at exactly 2x pixel density and fills one PDF page with matching dimensions.
- The generated PDF must have an invisible, Unicode-capable text layer for search and copy.
- Always clean up the temporary export DOM, object URL, and UI pending state after success or failure.
- Keep this iteration to a PDF download: no notes, bookmarks, handouts, tagged PDF, PDF/A, or persistent generated file.

---

### Task 1: Add the export regression test and browser dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `e2e/tests/main.test.ts:768-785`

**Interfaces:**
- Consumes: the editor preview action identified by title `Export current presentation as PDF`.
- Produces: installed `html-to-image`, `pdf-lib`, and `@pdf-lib/fontkit` packages plus a red end-to-end test for the download behaviour.

- [ ] **Step 1: Write the failing Playwright test**

  Extend `Editor: export` with a PDF test that creates `Export PDF Test`, reaches its editor, clicks `page.getByTitle("Export current presentation as PDF")`, waits for a download, asserts a `.pdf` filename, and verifies the first bytes are `%PDF-`.

  ```ts
  test("export active deck as PDF triggers a PDF download", async ({ page }) => {
  \tawait page.goto("/");
  \tawait page.getByRole("button", { name: "Create Presentation" }).click();
  \tawait fillPresentationName(page, "Export PDF Test");
  \tawait page.getByRole("button", { name: "Create" }).click();
  \tawait clickLastCard(page, "Export PDF Test");
  \tawait waitForSidebar(page);

  \tconst [download] = await Promise.all([
  \t\tpage.waitForEvent("download"),
  \t\tpage.getByTitle("Export current presentation as PDF").click(),
  \t]);
\texpect(download.suggestedFilename()).toMatch(/\\.pdf$/i);
  \tconst stream = await download.createReadStream();
  \texpect(stream).not.toBeNull();
  \tconst chunks: Buffer[] = [];
  \tfor await (const chunk of stream!) chunks.push(chunk);
  \texpect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe("%PDF-");
  });
  ```

- [ ] **Step 2: Run the focused test and verify it fails because the action does not exist**

  Run: `pnpm --filter e2e test -- --grep "export active deck as PDF"`

  Expected: FAIL because no element has title `Export current presentation as PDF`.

- [ ] **Step 3: Add runtime dependencies**

  Add the following `frontend` runtime dependencies, then refresh the workspace lockfile:

  ```json
  "@pdf-lib/fontkit": "^1.1.1",
  "html-to-image": "^1.11.13",
  "pdf-lib": "^1.17.1"
  ```

  Run: `pnpm --filter vite-app add @pdf-lib/fontkit@^1.1.1 html-to-image@^1.11.13 pdf-lib@^1.17.1`

- [ ] **Step 4: Commit the red test and dependencies**

  ```bash
  git add frontend/package.json pnpm-lock.yaml e2e/tests/main.test.ts
  git commit -m "test: cover PDF export download"
  ```

### Task 2: Implement reusable Marp PDF generation

**Files:**
- Create: `frontend/src/lib/pdf-export.ts`

**Interfaces:**
- Consumes: `ExportMarpPdfOptions` with `html`, `css`, and `filename` string fields.
- Produces: `exportMarpPdf(options: ExportMarpPdfOptions): Promise<void>`.

- [ ] **Step 1: Add pure helpers before the export function**

  Add a `dataUrlToUint8Array(dataUrl: string): Uint8Array` helper using `fetch(dataUrl).arrayBuffer()`, a `downloadPdf(bytes, filename)` helper that creates and revokes an object URL, and a `toPdfFilename` helper that turns the selected deck label into a lowercase hyphenated `.pdf` filename.

  ```ts
  export type ExportMarpPdfOptions = {
  \thtml: string;
  \tcss: string;
  \tfilename: string;
  };

  export function toPdfFilename(name: string): string {
  \tconst stem = name.trim().toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  \treturn `${stem || "presentation"}.pdf`;
  }
  ```

- [ ] **Step 2: Build the renderable export container**

  Append an `aria-hidden` `div` outside the viewport, with a `<style>` containing the Marp CSS and the supplied HTML. It must remain measurable, force `div.marpit` to stack slides without preview borders, wait for `document.fonts.ready`, and await `img.decode()` for all images. Throw `new Error("No Marp slides available for PDF export.")` when no `svg[data-marpit-svg]` elements exist.

- [ ] **Step 3: Capture pages and add an invisible text layer**

  For every Marp SVG slide, use `toPng(slide, { pixelRatio: 2, cacheBust: true, backgroundColor: "white", width, height, canvasWidth: width * 2, canvasHeight: height * 2 })`. Create a same-aspect-ratio `pdf-lib` page, draw its PNG at complete page bounds, and then use `TreeWalker` plus `Range.getClientRects()` to obtain non-whitespace text fragments. Embed the project Geist WOFF2 via `fontkit` and `TextRenderingMode.Invisible`; map each fragment's browser rectangle from the slide coordinate system into PDF points and draw it at the matching lower-left point. Ignore zero-area text rectangles.

- [ ] **Step 4: Guarantee cleanup and download**

  Wrap the entire DOM mutation in `try/finally`, remove the container in `finally`, call `pdf.save()`, and invoke the object-URL download helper only after all pages are generated. Do not use `window.print()`.

- [ ] **Step 5: Type-check the library**

  Run: `pnpm --filter vite-app typecheck`

  Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit the exporter**

  ```bash
  git add frontend/src/lib/pdf-export.ts
  git commit -m "feat: add client-side PDF exporter"
  ```

### Task 3: Wire the editor action and turn the regression green

**Files:**
- Modify: `frontend/src/components/preview-pane.tsx:1-270`
- Modify: `e2e/tests/main.test.ts:768-810`

**Interfaces:**
- Consumes: `exportMarpPdf({ html, css, filename })` from `@/lib/pdf-export`.
- Produces: a button titled `Export current presentation as PDF` and an error alert if generation fails.

- [ ] **Step 1: Add the button state and handler**

  Import `exportMarpPdf` and `useState`. Keep `isExportingPdf` and `pdfExportError` in `PreviewPane`. The handler calls the exporter with `rendered.html`, `rendered.css`, and `label ?? "presentation"`, clears any old error before starting, and uses `try/catch/finally` to re-enable the action. Surface an `ErrorAlert` using the existing component pattern.

  ```tsx
  <Button
  \tvariant="outline"
  \tsize="sm"
  \ttitle="Export current presentation as PDF"
  \tdisabled={!label || isExportingPdf}
  \tonClick={() => void handleExportPdf()}
  >
  \t{isExportingPdf ? "Exporting PDF…" : "Export PDF"}
  </Button>
  ```

- [ ] **Step 2: Re-run the focused regression test and verify it passes**

  Run: `pnpm --filter e2e test -- --grep "export active deck as PDF"`

  Expected: PASS and the download begins with `%PDF-`.

- [ ] **Step 3: Run focused quality checks**

  Run: `pnpm --filter vite-app typecheck && pnpm format:check && pnpm lint`

  Expected: all commands exit 0.

- [ ] **Step 4: Commit the UI integration**

  ```bash
  git add frontend/src/components/preview-pane.tsx e2e/tests/main.test.ts
  git commit -m "feat: add PDF export action"
  ```

### Task 4: Final verification

**Files:**
- Verify: `frontend/src/lib/pdf-export.ts`
- Verify: `frontend/src/components/preview-pane.tsx`
- Verify: `e2e/tests/main.test.ts`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified implementation ready for review.

- [ ] **Step 1: Run the repository verification suite**

  Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm --filter server test && pnpm --filter e2e test -- --grep "export active deck as PDF"`

  Expected: all commands exit 0; the focused browser test downloads a valid PDF header.

- [ ] **Step 2: Inspect the implementation against the global constraints**

  Verify that no backend route or Chromium dependency was added; the exporter uses a 2x PNG background plus invisible embedded-font text; the UI resets its pending state after errors; and the new action exports only the active preview content.

- [ ] **Step 3: Commit any formatting-only corrections**

  ```bash
  git add frontend/src/lib/pdf-export.ts frontend/src/components/preview-pane.tsx e2e/tests/main.test.ts frontend/package.json pnpm-lock.yaml
  git commit -m "style: format PDF export"
  ```
