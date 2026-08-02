import assert from "node:assert/strict";
import test from "node:test";
import type { DeckFile } from "../../lib/types.ts";
import { getImageUploadDestination, getMarkdownRelativeFilePath } from "./image-upload-paths.ts";

const file = (id: string, type: DeckFile["type"] = "asset"): DeckFile => ({
	id,
	label: id,
	type,
	...(type === "markdown" ? { documentName: `project/test/${id}` } : {}),
});

test("prefers an images folder beside the Markdown deck", () => {
	const files = [
		file("decks/slides.md", "markdown"),
		file("decks/assets", "folder"),
		file("decks/images", "folder"),
	];

	assert.equal(getImageUploadDestination(files, "decks/slides.md"), "decks/images");
});

test("uses a root conventional folder when the deck has no local one", () => {
	const files = [file("decks/slides.md", "markdown"), file("assets/logo.png")];

	assert.equal(getImageUploadDestination(files, "decks/slides.md"), "assets");
});

test("keeps images beside the deck when no conventional folder exists", () => {
	assert.equal(
		getImageUploadDestination([file("decks/slides.md", "markdown")], "decks/slides.md"),
		"decks",
	);
});

test("keeps a deck already inside a conventional folder in that folder", () => {
	assert.equal(
		getImageUploadDestination([file("images/slides.md", "markdown")], "images/slides.md"),
		"images",
	);
});

test("matches conventional folder names case-insensitively and preserves their path", () => {
	const files = [file("slides.md", "markdown"), file("Images", "folder")];

	assert.equal(getImageUploadDestination(files, "slides.md"), "Images");
});

test("builds Markdown paths relative to the deck folder", () => {
	assert.equal(getMarkdownRelativeFilePath("slides.md", "assets/photo.png"), "assets/photo.png");
	assert.equal(
		getMarkdownRelativeFilePath("decks/slides.md", "decks/images/photo.png"),
		"images/photo.png",
	);
	assert.equal(
		getMarkdownRelativeFilePath("decks/slides.md", "assets/photo.png"),
		"../assets/photo.png",
	);
	assert.equal(getMarkdownRelativeFilePath("decks/slides.md", "decks/photo.png"), "photo.png");
});
