import assert from "node:assert/strict";
import test from "node:test";
import {
	findPresenterImage,
	getNextPresenterChange,
	parseSlidePresenterComments,
} from "./presenter-comments.ts";

test("uses an explicit presenter comment as metadata", () => {
	assert.deepEqual(
		parseSlidePresenterComments(["Remember the demo", " Presenter: Alice ", "Show the chart"]),
		{
			presenter: "Alice",
			speakerNotes: ["Remember the demo", "Show the chart"],
		},
	);
});

test("keeps plain comments as speaker notes", () => {
	assert.deepEqual(parseSlidePresenterComments(["Alice", "Remember the demo"]), {
		presenter: null,
		speakerNotes: ["Alice", "Remember the demo"],
	});
});

test("returns no presenter for a slide without comments", () => {
	assert.deepEqual(parseSlidePresenterComments([]), {
		presenter: null,
		speakerNotes: [],
	});
});

test("detects a presenter handoff on the next slide", () => {
	assert.equal(getNextPresenterChange("Alice", "Bob"), "Bob");
	assert.equal(getNextPresenterChange("Alice", "alice"), null);
	assert.equal(getNextPresenterChange("Alice", null), null);
});

test("finds an image belonging to the named presenter", () => {
	assert.equal(
		findPresenterImage("ALICE", [
			{ name: "Bob", image: "bob.png" },
			{ name: "Alice", image: "alice.png" },
		]),
		"alice.png",
	);
});

test("returns no presenter image when the user has none or is unknown", () => {
	assert.equal(findPresenterImage("Alice", [{ name: "Alice", image: null }]), null);
	assert.equal(findPresenterImage("Alice", [{ name: "Bob", image: "bob.png" }]), null);
});
