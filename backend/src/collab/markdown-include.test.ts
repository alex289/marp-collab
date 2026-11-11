// Async fixtures implement the asynchronous file-reader contract.
/* oxlint-disable require-await */
import { test } from "node:test";
import { equal, ok, deepEqual } from "node:assert/strict";
import { expandMarkdownIncludes, hasMarkdownIncludes } from "../../../shared/markdown-include.ts";

const include = (path: string) => `<!-- @include: ${path} -->`;

test("expands relative nested includes, strips frontmatter and maps source lines", async () => {
	const files = new Map([
		["chapters/intro.md", "---\r\ntitle: ignored\r\n---\r\n# Intro\n" + include("nested.markdown")],
		["chapters/nested.markdown", "---\n# Nested"],
	]);
	let mapping: number[] = [];
	const result = await expandMarkdownIncludes(
		"# Main\n" + include("../chapters/intro.md") + "\nEnd",
		"decks/main.md",
		async (id) => files.get(id),
		(lines) => {
			mapping = lines;
		},
	);
	equal(result, "# Main\n# Intro\n---\n# Nested\nEnd");
	deepEqual(mapping, [1, 2, 2, 2, 3]);
});

test("rejects invalid paths and extensions without reading files", async () => {
	for (const path of [
		"../../outside.md",
		"/absolute.md",
		"https://host/file.md",
		"bad\\file.md",
		"file.md?x",
		"image.png",
		"bad\0.md",
	]) {
		const result = await expandMarkdownIncludes(include(path), "main.md", async () => {
			throw new Error("must not read");
		});
		ok(result.includes("Include error"));
	}
});

test("reports cycles and missing files, while allowing repeated includes", async () => {
	let reads = 0;
	const result = await expandMarkdownIncludes(
		[include("a.md"), include("a.md"), include("missing.md"), include("main.md")].join("\n"),
		"main.md",
		async (id) => {
			reads++;
			return id === "a.md" ? "Repeated" : undefined;
		},
	);
	equal(reads, 2);
	equal(result.match(/Repeated/g)?.length, 2);
	ok(result.includes("file not found"));
	ok(result.includes("circular include"));
});

test("leaves inline, indented and fenced examples untouched", async () => {
	const source = [
		"```md",
		include("a.md"),
		"```",
		"~~~",
		include("b.md"),
		"~~~",
		"Example: " + include("c.md"),
		"    " + include("d.md"),
	].join("\n");
	equal(hasMarkdownIncludes(source), false);
	equal(
		await expandMarkdownIncludes(source, "main.md", async () => {
			throw new Error("must not read examples");
		}),
		source,
	);
});

test("bounds depth, breadth and total expanded size", async () => {
	let reads = 0;
	const depth = await expandMarkdownIncludes(include("0.md"), "main.md", async () =>
		include(`${++reads}.md`),
	);
	equal(reads, 10);
	ok(depth.includes("depth limit"));
	reads = 0;
	const breadth = await expandMarkdownIncludes(include("a.md"), "main.md", async () => {
		reads++;
		return Array.from({ length: 20 }, (_, i) => include(`${reads}-${i}.md`)).join("\n");
	});
	ok(reads <= 100);
	ok(breadth.includes("size limit"));
	const size = await expandMarkdownIncludes(include("large.md"), "main.md", async () =>
		"x".repeat(1_000_001),
	);
	ok(size.includes("size limit"));
	ok(size.length < 1000);
});

test("strips YAML frontmatter at the first supported terminator without dropping slides", async () => {
	for (const newline of ["\n", "\r\n"]) {
		for (const terminator of ["---", "--- ", "..."]) {
			for (const body of ["# First", "# First\n\n---\n\n# Second"]) {
				const child = ["---", "marp: true", terminator, ...body.split("\n")].join(newline);
				const result = await expandMarkdownIncludes(
					include("child.md"),
					"main.md",
					async () => child,
				);
				equal(result, body.replaceAll("\n", newline));
			}
		}
	}
});

test("strips empty frontmatter before the first included slide", async () => {
	for (const terminator of ["---", "--- ", "..."]) {
		const body = "# First\n\n---\n\n# Second";
		const result = await expandMarkdownIncludes(
			include("child.md"),
			"main.md",
			async () => `---\n${terminator}\n${body}`,
		);
		equal(result, body);
	}
});
