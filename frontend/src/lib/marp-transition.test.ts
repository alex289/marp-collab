import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Marp } from "@marp-team/marp-core";
import { installSlideTransitions, parseTransitionDirective } from "./marp-transition.ts";

/** Reads the attributes of each slide section. */
function sectionAttributes(html: string) {
	return Array.from(html.matchAll(/<section\b([^>]*)>/g), ([, attrs = ""]) => {
		const found: Record<string, string> = {};
		for (const [, name = "", value = ""] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
			found[name] = value.replaceAll("&quot;", '"');
		}
		return found;
	});
}

function renderTransitions(markdown: string) {
	const marp = new Marp();
	installSlideTransitions(marp);
	return sectionAttributes(marp.render(markdown).html).map((attrs) => ({
		transition: attrs["data-transition"] ? JSON.parse(attrs["data-transition"]) : undefined,
		back: attrs["data-transition-back"] ? JSON.parse(attrs["data-transition-back"]) : undefined,
	}));
}

describe("parseTransitionDirective", () => {
	test("reads a name and an optional duration", () => {
		assert.deepEqual(parseTransitionDirective("fade"), { name: "fade" });
		assert.deepEqual(parseTransitionDirective(" cube 1.5s "), { name: "cube", duration: "1.5s" });
		assert.deepEqual(parseTransitionDirective("push 300ms"), { name: "push", duration: "300ms" });
	});

	test("drops durations and names that are not valid CSS", () => {
		assert.deepEqual(parseTransitionDirective("fade soon"), { name: "fade" });
		assert.equal(parseTransitionDirective("fa;de"), undefined);
		assert.equal(parseTransitionDirective(""), undefined);
		assert.equal(parseTransitionDirective(["fade"]), undefined);
	});
});

describe("installSlideTransitions", () => {
	test("marks each slide with its own transition and the previous one for going back", () => {
		const slides = renderTransitions(
			"---\ntransition: fade 1s\n---\n\n# One\n\n---\n\n<!-- transition: gate -->\n\n# Two\n\n---\n\n# Three\n",
		);
		assert.deepEqual(slides, [
			{ transition: { name: "fade", duration: "1s", builtinFallback: true }, back: undefined },
			{
				transition: { name: "gate" },
				back: { name: "fade", duration: "1s", builtinFallback: true },
			},
			{ transition: { name: "gate" }, back: { name: "gate" } },
		]);
	});

	test("limits a spot directive to one slide", () => {
		const slides = renderTransitions("<!-- _transition: zoom -->\n\n# One\n\n---\n\n# Two\n");
		assert.deepEqual(slides, [
			{ transition: { name: "zoom", builtinFallback: true }, back: undefined },
			{ transition: undefined, back: { name: "zoom", builtinFallback: true } },
		]);
	});

	test("follows keyframes renamed by a scoped style", () => {
		const marp = new Marp();
		installSlideTransitions(marp);
		const { html, css } = marp.render(
			"<!-- _transition: fade -->\n\n<style scoped>@keyframes marp-transition-fade { to { opacity: 0 } }</style>\n\n# One\n",
		);
		const [slide] = sectionAttributes(html);
		const transition = JSON.parse(slide?.["data-transition"] ?? "{}");
		assert.match(transition.name, /^fade-\w+$/);
		assert.equal(transition.builtinFallback, false);
		assert.ok(css.includes(`@keyframes marp-transition-${transition.name}`));
	});
});
