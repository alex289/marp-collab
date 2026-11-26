import { after, before, describe, test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Marp PDF rendering", () => {
	let tempDir: string;
	let storage: typeof import("../projects/storage.ts");
	let renderMarkdownForPdf: typeof import("./marp-render.ts").renderMarkdownForPdf;
	let renderMarkdownForSlides: typeof import("./marp-render.ts").renderMarkdownForSlides;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-render-test-"));
		process.env.DATA_PATH = tempDir;
		storage = await import("../projects/storage.ts");
		({ renderMarkdownForPdf, renderMarkdownForSlides } = await import("./marp-render.ts"));
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("extracts metadata and rewrites local and external assets", async () => {
		await storage.saveDocumentContent(
			"project/pdf-render/decks/review.md",
			`---
marp: true
title: Quarterly Review
author: Test Author
description: Project status
keywords: one, two
theme: custom
---

![Local](../assets/local.png)

![External](https://example.com/tracker.png)
`,
		);
		await storage.saveDocumentContent(
			"project/pdf-render/themes/custom.css",
			`/* @theme custom */
section { background-image: url("../assets/local.png"); }
`,
		);
		await storage.saveProjectFile("pdf-render", "assets/local.png", new Uint8Array([1, 2, 3]));

		const rendered = await renderMarkdownForPdf("pdf-render", "decks/review.md");

		ok(rendered);
		equal(rendered.title, "Quarterly Review");
		equal(rendered.author, "Test Author");
		equal(rendered.description, "Project status");
		deepEqual(rendered.keywords, ["one", "two"]);
		equal(rendered.assets.get("assets/local.png"), "asset0.png");
		equal(rendered.assets.size, 1);
		ok(rendered.html.includes("asset0.png"));
		ok(rendered.html.includes("data:image/gif;base64"));
		ok(rendered.css.includes("asset0.png"));
	});

	test("uses current content for both main and included documents", async () => {
		const rendered = await renderMarkdownForPdf("pdf-live", "deck.md", (name) =>
			Promise.resolve(
				name.endsWith("/deck.md") ? "# Live main\n\n<!-- @include: part.md -->" : "# Live included",
			),
		);
		ok(rendered?.html.includes("Live main"));
		ok(rendered?.html.includes("Live included"));
	});

	test("preserves included slides after a YAML end marker", async () => {
		const rendered = await renderMarkdownForPdf("pdf-yaml", "deck.md", (name) =>
			Promise.resolve(
				name.endsWith("/deck.md")
					? "# Main\n\n<!-- @include: part.md -->"
					: "---\nmarp: true\n...\n# First included\n\n---\n\n# Second included",
			),
		);
		ok(rendered?.html.includes("First included"));
		ok(rendered?.html.includes("Second included"));
	});

	test("reports directories and paths below regular files as missing includes", async () => {
		await storage.createProjectDir("pdf-invalid-target", "folder.md");
		await storage.saveDocumentContent("project/pdf-invalid-target/regular.md", "# A file");
		await storage.saveDocumentContent(
			"project/pdf-invalid-target/deck.md",
			"# Main\n\n<!-- @include: folder.md -->\n\n<!-- @include: regular.md/child.md -->",
		);
		const rendered = await renderMarkdownForPdf("pdf-invalid-target", "deck.md");
		ok(rendered?.html.includes("Main"));
		equal(rendered?.html.match(/file not found/g)?.length, 2);
	});

	test("generates Tailwind utilities only for decks that opt in", async () => {
		const body = `<div class="grid grid-cols-2 bg-[url(img/bg.png)] bg-[url(https://example.com/x.png)]">x</div>`;
		const read = (markdown: string) => () => Promise.resolve(markdown);

		const enabled = await renderMarkdownForPdf(
			"pdf-tailwind",
			"decks/deck.md",
			read(`---\nmarp: true\ntailwind: true\n---\n\n<!-- _class: invert -->\n\n${body}`),
		);
		ok(enabled);
		ok(enabled.css.includes("grid-template-columns: repeat(2, minmax(0, 1fr)) !important"));
		equal(enabled.assets.get("decks/img/bg.png"), "asset0.png");
		// The remote URL must reach Gotenberg only as the inert placeholder image.
		const tailwindCss = enabled.css.slice(enabled.css.indexOf("/*! tailwindcss"));
		deepEqual(
			[...tailwindCss.matchAll(/background-image: url\(([^)]*)\)/g)]
				.map((match) => match[1])
				.sort(),
			["asset0.png", "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="],
		);
		ok(!enabled.css.includes("--tw-invert"));

		const disabled = await renderMarkdownForPdf(
			"pdf-tailwind",
			"decks/deck.md",
			read(`---\nmarp: true\n---\n\n${body}`),
		);
		ok(disabled);
		ok(!disabled.css.includes("grid-template-columns"));
	});

	test("rewrites CSS URLs in linear time", async () => {
		// Unclosed `url(` and `@import` runs used to backtrack quadratically (seconds at this size).
		const css = `/* @theme slow */\nsection { --x: "${"url(".repeat(20_000)}${"@import ".repeat(20_000)}"; }`;
		await storage.saveDocumentContent("project/pdf-slow-css/slow.css", css);
		const started = performance.now();
		const rendered = await renderMarkdownForPdf("pdf-slow-css", "deck.md", (name) =>
			Promise.resolve(name.endsWith("/deck.md") ? "---\ntheme: slow\n---\n# Slow" : css),
		);
		ok(rendered?.html.includes("Slow"));
		ok(performance.now() - started < 1000);
	});

	test("returns undefined for a missing markdown document", async () => {
		equal(await renderMarkdownForPdf("pdf-render", "missing.md"), undefined);
	});

	test("expands @include comments and reports broken includes inline", async () => {
		await storage.saveDocumentContent(
			"project/pdf-include/deck.md",
			`# Main

<!-- @include: chapters/intro.md -->

<!-- @include: chapters/missing.md -->
`,
		);
		await storage.saveDocumentContent(
			"project/pdf-include/chapters/intro.md",
			`---
title: Should be stripped
---
## Included heading

<!-- @include: ./nested.md -->

<!-- @include: ../deck.md -->
`,
		);
		await storage.saveDocumentContent("project/pdf-include/chapters/nested.md", "Nested content");

		const rendered = await renderMarkdownForPdf("pdf-include", "deck.md");

		ok(rendered);
		ok(rendered.html.includes("Included heading"));
		ok(rendered.html.includes("Nested content"));
		ok(!rendered.html.includes("Should be stripped"));
		ok(rendered.html.includes("file not found"));
		ok(rendered.html.includes("circular include"));
	});

	test("renders individual slides with dimensions, Tailwind CSS, and live CSS themes", async () => {
		await storage.saveDocumentContent("project/slide-render/custom.css", "/* @theme custom */");
		await storage.saveDocumentContent(
			"project/slide-render/deck.md",
			`---
marp: true
size: 4:3
theme: custom
tailwind: true
---

# Slide one

<div class="grid grid-cols-2"></div>

---

# Slide two
`,
		);

		const rendered = await renderMarkdownForSlides("slide-render", "deck.md", (name) => {
			if (name.endsWith("/custom.css")) {
				return Promise.resolve("/* @theme custom */\n@import 'default';\nsection { color: teal; }");
			}
			return storage.getDocumentContent(name);
		});

		ok(rendered);
		equal(rendered.slides.length, 2);
		equal(rendered.slides[0]?.width, 960);
		equal(rendered.slides[0]?.height, 720);
		ok(rendered.slides[0]?.html.includes("Slide one"));
		ok(!rendered.slides[0]?.html.includes("<script>"));
		ok(!rendered.slides[1]?.html.includes("<script>"));
		ok(/color:\s*teal/.test(rendered.css));
		ok(rendered.css.includes("grid-template-columns: repeat(2, minmax(0, 1fr)) !important"));
	});
});
