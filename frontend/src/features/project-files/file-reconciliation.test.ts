import assert from "node:assert/strict";
import test from "node:test";
import type { DeckFile } from "../../lib/types.ts";
import {
	expandOpenFoldersForSelection,
	reconcileOpenFoldersAfterRename,
	reconcileSelectedFileAfterMove,
	reconcileSelectedFileAfterRename,
} from "./file-reconciliation.ts";

const markdown = (id: string): DeckFile => ({
	id,
	label: id,
	type: "markdown",
	documentName: `project/test/${id}`,
});

test("updates a selected markdown file after move", () => {
	const selected = markdown("old/slides.md");
	assert.deepEqual(
		reconcileSelectedFileAfterMove("project-1", selected, "old/slides.md", "new/slides.md"),
		{
			...selected,
			id: "new/slides.md",
			label: "new/slides.md",
			documentName: "project/project-1/new/slides.md",
		},
	);
});

test("rebases a selected child after folder rename", () => {
	const selected = markdown("old/nested/slides.md");
	assert.equal(
		reconcileSelectedFileAfterRename("project-1", selected, {
			type: "folder",
			oldFolderPath: "old",
			newFolderPath: "new",
		})?.id,
		"new/nested/slides.md",
	);
});

test("leaves an unrelated selection unchanged by identity", () => {
	const selected = markdown("other.md");
	assert.equal(
		reconcileSelectedFileAfterRename("project-1", selected, {
			type: "file",
			oldFileId: "slides.md",
			newFileId: "deck.md",
		}),
		selected,
	);
});

test("rebases open descendants after folder rename", () => {
	assert.deepEqual(
		reconcileOpenFoldersAfterRename(
			new Map([
				["old", true],
				["old/nested", true],
				["other", false],
			]),
			{ type: "folder", oldFolderPath: "old", newFolderPath: "new" },
		),
		new Map([
			["new", true],
			["new/nested", true],
			["other", false],
		]),
	);
});

test("opens every ancestor of the selected file", () => {
	assert.deepEqual(
		expandOpenFoldersForSelection(new Map([["closed", false]]), "a/b/slides.md"),
		new Map([
			["closed", false],
			["a", true],
			["a/b", true],
		]),
	);
});
