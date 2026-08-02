import assert from "node:assert/strict";
import test from "node:test";
import {
	CompletionContext,
	type CompletionResult,
	type CompletionSource,
} from "@codemirror/autocomplete";
import { css, cssCompletionSource } from "@codemirror/lang-css";
import { EditorState } from "@codemirror/state";
import type { DeckFile } from "../../lib/types.ts";
import {
	createEditorCompletionSource,
	extractThemeClassNames,
	type EditorCompletionConfig,
} from "./completions.ts";
import { marpMarkdown } from "./language.ts";

const files: DeckFile[] = [
	{ id: "decks/talk.md", label: "talk.md", type: "markdown" },
	{ id: "decks/images/portrait.png", label: "portrait.png", type: "asset" },
	{ id: "shared/logo.svg", label: "logo.svg", type: "asset" },
	{ id: "theme/fonts/inter.woff2", label: "inter.woff2", type: "asset" },
	{ id: "theme/theme.css", label: "theme.css", type: "markdown" },
];

const markdownConfig: EditorCompletionConfig = {
	fileKind: "markdown",
	currentFileId: "decks/talk.md",
	files,
	themeNames: ["default", "gaia", "whs"],
	projectThemes: [
		{
			id: "theme/theme.css",
			css: "section.title-page, section.invert { color: white; }\n.card:hover { color: red; }",
		},
	],
};

function complete(
	doc: string,
	config: EditorCompletionConfig = markdownConfig,
	explicit = false,
): CompletionResult | null {
	const state = EditorState.create({ doc });
	const result = createEditorCompletionSource(() => config)(
		new CompletionContext(state, doc.length, explicit),
	);
	assert.ok(!(result instanceof Promise));
	return result;
}

test("completes Marp directive names in YAML frontmatter", () => {
	const result = complete("---\npa");
	assert.ok(result);
	assert.equal(result.from, 4);
	assert.equal(result.options.find((option) => option.label === "paginate")?.apply, "paginate: ");
});

test("keeps spot directives out of frontmatter suggestions", () => {
	const result = complete("---\n", markdownConfig, true);
	assert.ok(result);
	assert.ok(result.options.some((option) => option.label === "backgroundColor"));
	assert.ok(!result.options.some((option) => option.label.startsWith("_")));
	assert.equal(complete("---\n_backgroundColor: wh"), null);
});

test("limits HTML comment directive suggestions to local and spot directives", () => {
	const result = complete("<!-- ", markdownConfig, true);
	assert.ok(result);
	assert.ok(result.options.some((option) => option.label === "backgroundColor"));
	assert.ok(result.options.some((option) => option.label === "_backgroundColor"));
	assert.ok(!result.options.some((option) => option.label === "theme"));
	assert.ok(!result.options.some((option) => option.label === "size"));
	assert.equal(complete("<!-- theme: wh"), null);
});

test("completes dynamic theme names as directive values", () => {
	const result = complete("---\ntheme: wh");
	assert.ok(result);
	assert.equal(result.from, 11);
	assert.deepEqual(
		result.options.map((option) => option.label),
		["default", "gaia", "whs"],
	);
});

test("completes spot directives and CSS-derived class names in comments", () => {
	const directiveResult = complete("# Slide\n\n<!-- _cl");
	assert.ok(directiveResult?.options.some((option) => option.label === "_class"));

	const valueResult = complete("# Slide\n\n<!-- _class: ti");
	assert.ok(valueResult);
	assert.deepEqual(
		valueResult.options.map((option) => option.label),
		["lead", "invert", "title-page", "card"],
	);
});

test("completes CSS-derived class names in inline HTML", () => {
	const result = complete('<div class="ti');
	assert.ok(result?.options.some((option) => option.label === "title-page"));
});

test("only completes HTML tags allowed by Marp", () => {
	const result = complete("<");
	assert.ok(result);
	assert.ok(result.options.some((option) => option.label === "div"));
	assert.ok(result.options.some((option) => option.label === "img"));
	assert.ok(!result.options.some((option) => option.label === "script"));
	assert.ok(!result.options.some((option) => option.label === "iframe"));
});

test("replaces CodeMirror's broad Markdown HTML completion source", () => {
	const source = createEditorCompletionSource(() => markdownConfig);
	const state = EditorState.create({
		doc: "<",
		extensions: [marpMarkdown(), EditorState.languageData.of(() => [{ autocomplete: source }])],
	});
	const sources = state.languageDataAt<CompletionSource>("autocomplete", state.doc.length);

	assert.deepEqual(sources, [source]);
});

test("completes image paths relative to the current Markdown file", () => {
	const result = complete("![Portrait](images/po");
	assert.ok(result);
	assert.equal(result.from, 12);
	assert.deepEqual(
		result.options.map((option) => option.apply),
		["images/portrait.png", "../shared/logo.svg"],
	);
});

test("preserves root-style paths for Markdown images", () => {
	const result = complete("![](/shared/lo");
	assert.ok(result?.options.some((option) => option.apply === "/shared/logo.svg"));
});

test("completes paths in Marp background image directives", () => {
	const result = complete('<!-- _backgroundImage: url("../shared/lo');
	assert.ok(result?.options.some((option) => option.apply === "../shared/logo.svg"));
});

test("wraps a path selected directly after backgroundImage in url()", () => {
	const result = complete("---\nbackgroundImage: images/po");
	assert.ok(result?.options.some((option) => option.apply === 'url("images/portrait.png")'));
});

test("completes project paths inside CSS url()", () => {
	const result = complete('section { background: url("fonts/in', {
		...markdownConfig,
		fileKind: "css",
		currentFileId: "theme/theme.css",
	});
	assert.ok(result?.options.some((option) => option.apply === "fonts/inter.woff2"));
	assert.ok(!result?.options.some((option) => option.apply === "../decks/talk.md"));
});

test("completes the Marp CSS theme marker", () => {
	const result = complete("/* @th", {
		...markdownConfig,
		fileKind: "css",
		currentFileId: "theme/company.css",
	});
	assert.equal(result?.options[0]?.label, "@theme");
	assert.equal(result?.options[0]?.apply, "@theme company */");
});

test("sanitizes a CSS filename for the default theme marker", () => {
	const result = complete("/* @th", {
		...markdownConfig,
		fileKind: "css",
		currentFileId: "theme/Company Theme.css",
	});
	assert.equal(result?.options[0]?.apply, "@theme company-theme */");
});

test("completes registered themes and CSS files in @import", () => {
	const result = complete('@import "', {
		...markdownConfig,
		fileKind: "css",
		currentFileId: "theme/company.css",
	});
	assert.ok(result?.options.some((option) => option.apply === "default"));
	assert.ok(result?.options.some((option) => option.apply === "theme.css"));
	assert.ok(!result?.options.some((option) => option.apply === "fonts/inter.woff2"));
});

test("completes Marp selectors and project theme classes in CSS", () => {
	const result = complete("section.ti", {
		...markdownConfig,
		fileKind: "css",
		currentFileId: "theme/theme.css",
	});
	assert.ok(result?.options.some((option) => option.apply === "section.title-page"));
});

test("adds project completions without replacing CodeMirror CSS completions", () => {
	const source = createEditorCompletionSource(() => ({
		...markdownConfig,
		fileKind: "css",
	}));
	const state = EditorState.create({
		doc: "section",
		extensions: [css(), EditorState.languageData.of(() => [{ autocomplete: source }])],
	});
	const sources = state.languageDataAt<CompletionSource>("autocomplete", state.doc.length);

	assert.ok(sources.includes(source));
	assert.ok(sources.includes(cssCompletionSource));
});

test("extracts class names only from CSS selector preludes", () => {
	assert.deepEqual(
		extractThemeClassNames(`
			/* .commented-out { content: "}"; } */
			section.hero, .card:hover { background: url("image.with-dots.png"); }
			@media print { section.print-only { content: "{ .not-a-selector }"; } }
		`),
		["hero", "card", "print-only"],
	);
});
