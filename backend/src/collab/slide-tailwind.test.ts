import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { __unstable__loadDesignSystem } from "tailwindcss";
import {
	extractClassCandidates,
	TAILWIND_INPUT_CSS,
	tailwindCompileOptions,
} from "../../../shared/slide-tailwind.ts";
import { createSlideTailwind } from "./slide-tailwind.ts";

test("collects unique, decoded class names from rendered HTML", () => {
	const html = `<section id="1" class="lead p-8"><div class="grid  grid-cols-2 lead">
<span class="content-[&#39;x&#39;] [&amp;&gt;*]:p-2 after:content-[&quot;y&quot;]">a</span></div></section>`;
	deepEqual(extractClassCandidates(html), [
		"lead",
		"p-8",
		"grid",
		"grid-cols-2",
		"content-['x']",
		"[&>*]:p-2",
		'after:content-["y"]',
	]);
});

test("keeps the Marp invert class on slides away from Tailwind's color filter", () => {
	const html = `<section class="invert"><img class="invert" src="a.png"></section>`;
	deepEqual(extractClassCandidates(html), ["invert"]);
	deepEqual(extractClassCandidates(`<section class="invert"></section>`), []);
});

test("drops candidates that could close the surrounding style element", async () => {
	const html = `<p class="content-['</style><script>alert(1)</script>'] content-[&lt;/style&gt;] p-1">x</p>`;
	ok(!extractClassCandidates(html).some((name) => name.includes("<")));
	const css = (await createSlideTailwind())(html);
	ok(!css.toLowerCase().includes("</style"));
	ok(css.includes("padding: var(--spacing) !important"));
});

test("generates important utilities without preflight", async () => {
	const css = (await createSlideTailwind())(`<div class="text-sky-500 flex">x</div>`);
	ok(css.includes("color: var(--color-sky-500) !important"));
	ok(css.includes("display: flex !important"));
	ok(!css.includes("box-sizing: border-box"));
});

// The editor's Tailwind completions (frontend/src/lib/slide-tailwind.ts) rely on this
// unstable API. Fail here when a Tailwind update changes its shape.
test("exposes the Tailwind design system used for editor completions", async () => {
	const themeCss = readFileSync("node_modules/tailwindcss/theme.css", "utf8");
	const designSystem = await __unstable__loadDesignSystem(
		TAILWIND_INPUT_CSS,
		tailwindCompileOptions(themeCss),
	);

	const classes = designSystem.getClassList().map(([name]) => name);
	ok(classes.includes("bg-sky-500"));
	ok(classes.includes("-mt-4"));

	const hover = designSystem.getVariants().find((variant) => variant.name === "hover");
	deepEqual(hover?.values, []);
	const max = designSystem.getVariants().find((variant) => variant.name === "max");
	equal(max?.hasDash, true);
	ok(max?.values.includes("md"));

	const [css, unknown] = designSystem.candidatesToCss(["grid", "not-a-utility"]);
	ok(css?.includes("display: grid !important"));
	equal(unknown, null);
});
