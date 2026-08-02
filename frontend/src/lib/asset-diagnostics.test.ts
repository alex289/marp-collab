import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findMissingAssetReferences } from "./asset-diagnostics.ts";

describe("findMissingAssetReferences", () => {
	test("finds missing inline, reference-style, and HTML Markdown images", () => {
		const markdown = [
			"![existing](../assets/logo.png)",
			"![missing](images/missing.png?size=2#preview)",
			"![reference][hero]",
			"[hero]: /assets/missing-hero.svg",
			'<img alt="Logo" src="images/missing-html.webp">',
			"`![example](images/in-code.png)`",
			"```md",
			"![example](images/in-fence.png)",
			"```",
			"![remote](https://example.com/image.png)",
			"![embedded](data:image/png;base64,abc)",
		].join("\n\n");

		const missing = findMissingAssetReferences(
			markdown,
			"slides/deck.md",
			"markdown",
			new Set(["assets/logo.png"]),
		);

		assert.deepEqual(
			missing.map(({ reference, resolvedPath }) => ({ reference, resolvedPath })),
			[
				{
					reference: "images/missing.png?size=2#preview",
					resolvedPath: "slides/images/missing.png",
				},
				{ reference: "/assets/missing-hero.svg", resolvedPath: "assets/missing-hero.svg" },
				{
					reference: "images/missing-html.webp",
					resolvedPath: "slides/images/missing-html.webp",
				},
			],
		);
		for (const diagnostic of missing) {
			assert.equal(markdown.slice(diagnostic.from, diagnostic.to), diagnostic.reference);
		}
	});

	test("resolves angle-bracket, encoded, collapsed, and shortcut Markdown image paths", () => {
		const markdown = [
			"[photo]: <images/hello%20world.png>",
			"[shortcut]: images/shortcut.png",
			"",
			"![photo][] ![shortcut]",
		].join("\n");

		assert.deepEqual(
			findMissingAssetReferences(
				markdown,
				"deck.md",
				"markdown",
				new Set(["images/hello world.png"]),
			).map(({ reference, resolvedPath }) => ({ reference, resolvedPath })),
			[{ reference: "images/shortcut.png", resolvedPath: "images/shortcut.png" }],
		);
	});

	test("finds missing CSS image and font URLs without inspecting comments or strings", () => {
		const css = [
			"/* url(images/comment.png) */",
			"@font-face {",
			'  src: local("Inter"), url("../fonts/inter.woff2") format("woff2"),',
			"    url(../fonts/missing.ttf) format('truetype');",
			"}",
			'.hero { background: url("images/missing background.png"); }',
			'.remote { background: url("https://example.com/image.png"); }',
			'.embedded { background: url("data:image/png;base64,abc"); }',
			'.fragment { mask: url("#icon"); }',
			".variable { background: url(var(--image)); }",
			'.text::after { content: "url(images/string.png)"; }',
		].join("\n");

		const missing = findMissingAssetReferences(
			css,
			"themes/theme.css",
			"css",
			new Set(["fonts/inter.woff2"]),
		);

		assert.deepEqual(
			missing.map(({ reference, resolvedPath }) => ({ reference, resolvedPath })),
			[
				{ reference: "../fonts/missing.ttf", resolvedPath: "fonts/missing.ttf" },
				{
					reference: "images/missing background.png",
					resolvedPath: "themes/images/missing background.png",
				},
			],
		);
		for (const diagnostic of missing) {
			assert.equal(css.slice(diagnostic.from, diagnostic.to), diagnostic.reference);
		}
	});
});
