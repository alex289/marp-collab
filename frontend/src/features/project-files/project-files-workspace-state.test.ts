import assert from "node:assert/strict";
import test from "node:test";
import {
	emptyProjectFilesDragState,
	endProjectFileDrag,
	setProjectFileDragOver,
	startProjectFileDrag,
} from "./project-files-workspace-state.ts";

test("starts, updates and ends an internal drag", () => {
	const started = startProjectFileDrag("slides.md");
	assert.deepEqual(started, { draggingFileId: "slides.md", dragOverPath: null });
	assert.deepEqual(setProjectFileDragOver(started, "folder"), {
		draggingFileId: "slides.md",
		dragOverPath: "folder",
	});
	assert.deepEqual(endProjectFileDrag(), emptyProjectFilesDragState);
});

test("keeps drag state identity when the target does not change", () => {
	const state = { draggingFileId: "slides.md", dragOverPath: "folder" };
	assert.equal(setProjectFileDragOver(state, "folder"), state);
});
