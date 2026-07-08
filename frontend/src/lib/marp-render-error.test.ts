import { deepEqual, equal, match, doesNotMatch } from "node:assert/strict";
import { describe, test } from "node:test";
import { createMarpRenderErrorFallback, getMarpRenderErrorMessage } from "./marp-render-error.ts";

describe("marp render errors", () => {
	test("creates a render fallback with the thrown error message", () => {
		const fallback = createMarpRenderErrorFallback(new Error("Unknown theme: custom"));

		equal(fallback.errorMessage, "Unknown theme: custom");
		equal(fallback.css, "");
		deepEqual(fallback.comments, [[]]);
		match(fallback.html, /Marp Render Fehler/);
		match(fallback.html, /Unknown theme: custom/);
	});

	test("escapes thrown messages before embedding them into fallback HTML", () => {
		const fallback = createMarpRenderErrorFallback(new Error("<script>alert(1)</script>"));

		match(fallback.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
		doesNotMatch(fallback.html, /<script>alert\(1\)<\/script>/);
	});

	test("uses readable messages for non-Error throws", () => {
		equal(getMarpRenderErrorMessage("broken directive"), "broken directive");
		equal(getMarpRenderErrorMessage(null), "Unbekannter Fehler");
	});
});
