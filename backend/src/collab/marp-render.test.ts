import { after, before, describe, test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Marp PDF rendering", () => {
	let tempDir: string;
	let storage: typeof import("../projects/storage.ts");
	let renderMarkdownForPdf: typeof import("./marp-render.ts").renderMarkdownForPdf;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-render-test-"));
		process.env.DATA_PATH = tempDir;
		storage = await import("../projects/storage.ts");
		({ renderMarkdownForPdf } = await import("./marp-render.ts"));
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
});
