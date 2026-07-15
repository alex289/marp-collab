import assert from "node:assert/strict";
import test from "node:test";
import type { DeckFile } from "../../lib/types.ts";
import {
	buildFileTree,
	getAncestorFolderPaths,
	getParentFolderPath,
	normalizeProjectFilePath,
} from "./file-tree.ts";

const file = (id: string, type: DeckFile["type"] = "markdown"): DeckFile => ({
	id,
	label: id,
	type,
	...(type === "markdown" ? { documentName: `project/test/${id}` } : {}),
});

test("normalizes separators and surrounding slashes", () => {
	assert.equal(normalizeProjectFilePath("/slides\\intro.md/"), "slides/intro.md");
});

test("builds implicit folders and hides .keep", () => {
	assert.deepEqual(buildFileTree([file("notes/.keep", "asset"), file("notes/intro.md")]), [
		{
			name: "notes",
			path: "notes",
			file: null,
			children: [
				{
					name: "intro.md",
					path: "notes/intro.md",
					file: file("notes/intro.md"),
					children: [],
				},
			],
		},
	]);
});

test("sorts folders before files and names alphabetically", () => {
	assert.deepEqual(
		buildFileTree([file("z.md"), file("b/item.md"), file("a/item.md"), file("a.md")]).map(
			(node) => node.name,
		),
		["a", "b", "a.md", "z.md"],
	);
});

test("preserves explicit folder records", () => {
	const folder = file("assets", "folder");
	assert.equal(buildFileTree([folder, file("assets/logo.png", "asset")])[0]?.file, folder);
});

test("returns ancestor and parent paths", () => {
	assert.deepEqual(getAncestorFolderPaths("a/b/slides.md"), ["a", "a/b"]);
	assert.equal(getParentFolderPath("a/b/slides.md"), "a/b");
	assert.equal(getParentFolderPath("slides.md"), "");
});
