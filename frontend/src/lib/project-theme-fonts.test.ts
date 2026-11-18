import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
	MAX_EMBEDDED_FONT_BYTES,
	MAX_EMBEDDED_THEME_FONT_BYTES,
	inlineProjectThemeFonts,
} from "./project-theme-fonts.ts";

const prefix = "/api/v1/projects/p1/files/";
const originalFetch = globalThis.fetch;
let requested: string[];
let respond: (path: string) => Response | Promise<Response>;

function fontResponse(body = "font", contentType = "font/woff2") {
	return new Response(body, { headers: { "Content-Type": contentType } });
}

beforeEach(() => {
	requested = [];
	respond = () => fontResponse();
	globalThis.fetch = ((path: string) => {
		requested.push(path);
		// Defer so a throwing responder rejects like a failed network request.
		return Promise.resolve().then(() => respond(path));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("inlineProjectThemeFonts", () => {
	test("embeds every project font reference with a MIME type from its extension", async () => {
		respond = () => fontResponse("font", 'font/x"); color: red');
		const css = [
			`@font-face { src: url("${prefix}a.woff2?v=1&token=t"); }`,
			`@font-face { src: url(${prefix}fonts/b.ttf); }`,
			`section { background: url(${prefix}bg.png); }`,
		].join("\n");

		const result = await inlineProjectThemeFonts(css, "p1", new Map());

		assert.deepEqual(requested, [`${prefix}a.woff2`, `${prefix}fonts/b.ttf`]);
		assert.equal(
			result,
			[
				`@font-face { src: url("data:font/woff2;base64,${btoa("font")}"); }`,
				`@font-face { src: url(data:font/ttf;base64,${btoa("font")}); }`,
				`section { background: url(${prefix}bg.png); }`,
			].join("\n"),
		);
	});

	test("ignores fonts outside the current project", async () => {
		const css = [
			`url(/api/v1/projects/p2/files/a.woff2)`,
			`url(${prefix}../../p2/files/b.woff2)`,
			`url(${prefix}%2e%2e/%2e%2e/p2/files/c.woff2)`,
			`url(https://example.com${prefix}d.woff2)`,
		]
			.map((reference) => `@font-face { src: ${reference}; }`)
			.join("\n");

		assert.equal(await inlineProjectThemeFonts(css, "p1", new Map()), css);
		assert.deepEqual(requested, []);
	});

	test("keeps the URL for non-font responses and oversized fonts", async () => {
		respond = (path) =>
			path.endsWith("login.woff2")
				? fontResponse("<html>", "text/html")
				: fontResponse("x".repeat(MAX_EMBEDDED_FONT_BYTES + 1));
		const css = `@font-face { src: url(${prefix}login.woff2), url(${prefix}huge.woff2); }`;

		assert.equal(await inlineProjectThemeFonts(css, "p1", new Map()), css);
	});

	test("accepts generic font MIME types from the server", async () => {
		respond = (path) =>
			fontResponse(
				"font",
				path.endsWith("a.woff2") ? "application/octet-stream" : "Application/X-Font-TTF",
			);
		const css = `@font-face { src: url(${prefix}a.woff2), url(${prefix}b.ttf); }`;

		assert.equal(
			await inlineProjectThemeFonts(css, "p1", new Map()),
			`@font-face { src: url(data:font/woff2;base64,${btoa("font")}), url(data:font/ttf;base64,${btoa("font")}); }`,
		);
	});

	test("keeps fonts beyond the theme budget as URLs", async () => {
		respond = () => fontResponse("x".repeat(4 * 1024 * 1024));
		const css = ["a", "b", "c"]
			.map((name) => `@font-face { src: url(${prefix}${name}.woff2); }`)
			.join("\n");

		const result = await inlineProjectThemeFonts(css, "p1", new Map());

		assert.equal(result.match(/data:font\/woff2/g)?.length, 2);
		assert.ok(result.endsWith(`@font-face { src: url(${prefix}c.woff2); }`));
		assert.ok(MAX_EMBEDDED_THEME_FONT_BYTES < 3 * 4 * 1024 * 1024);
	});

	test("shares requests and caches failures until the file list changes", async () => {
		const requests = new Map<string, Promise<string | undefined>>();
		const css = `@font-face { src: url(${prefix}a.woff2); } @font-face { src: url(${prefix}missing.woff2); }`;
		respond = (path) => {
			if (path.endsWith("missing.woff2")) {
				return new Response("", { status: 404 });
			}
			throw new TypeError("Failed to fetch");
		};

		assert.equal(await inlineProjectThemeFonts(css, "p1", requests), css);
		assert.equal(await inlineProjectThemeFonts(css, "p1", requests), css);
		assert.deepEqual(requested, [`${prefix}a.woff2`, `${prefix}missing.woff2`]);
	});
});
