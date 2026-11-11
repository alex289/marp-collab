import { test } from "node:test";
import { equal, rejects } from "node:assert/strict";
import { resolveMarkdownIncludes } from "./markdown-include.ts";

test("fetches fresh include content, escapes URL segments and forwards cancellation", async (t) => {
	let content = "# First";
	let reads = 0;
	const controller = new AbortController();
	t.mock.method(globalThis, "fetch", (url: string, options: RequestInit) => {
		equal(url, "/api/v1/projects/project/files/chapters/my%20file.md");
		equal(options.cache, "no-store");
		equal(options.signal, controller.signal);
		reads++;
		return Promise.resolve(new Response(content));
	});
	const source = "<!-- @include: chapters/my file.md -->";
	equal(await resolveMarkdownIncludes(source, "project", "main.md", controller.signal), "# First");
	content = "# Updated";
	equal(
		await resolveMarkdownIncludes(source, "project", "main.md", controller.signal),
		"# Updated",
	);
	equal(reads, 2);
});

test("reports missing files and propagates access failures for retry", async (t) => {
	let status = 404;
	t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response("", { status })));
	const source = "<!-- @include: missing.md -->";
	equal(
		await resolveMarkdownIncludes(source, "project", "main.md"),
		"> ⚠️ **Include error:** file not found",
	);
	status = 403;
	await rejects(resolveMarkdownIncludes(source, "project", "main.md"), /Could not load/);
});
