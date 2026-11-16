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
			demo: null,
			speakerNotes: ["Remember the demo", "Show the chart"],
		},
	);
});

test("keeps plain comments as speaker notes", () => {
	assert.deepEqual(parseSlidePresenterComments(["Alice", "Remember the demo"]), {
		presenter: null,
		demo: null,
		speakerNotes: ["Alice", "Remember the demo"],
	});
});

test("returns no presenter for a slide without comments", () => {
	assert.deepEqual(parseSlidePresenterComments([]), {
		presenter: null,
		demo: null,
		speakerNotes: [],
	});
});

test("marks a slide as a live demo with an optional title", () => {
	assert.deepEqual(parseSlidePresenterComments(["Demo: Login flow", "Open the admin panel"]), {
		presenter: null,
		demo: "Login flow",
		speakerNotes: ["Open the admin panel"],
	});
	assert.equal(parseSlidePresenterComments(["demo"]).demo, "");
	assert.equal(parseSlidePresenterComments(["demo:"]).demo, "");
});

test("shows only the first line of a demo marker to the audience", () => {
	assert.deepEqual(
		parseSlidePresenterComments([
			"demo: Login flow\nLog in as admin / secret\n\nThen open settings",
		]),
		{
			presenter: null,
			demo: "Login flow",
			speakerNotes: ["Log in as admin / secret\n\nThen open settings"],
		},
	);
	assert.deepEqual(parseSlidePresenterComments(["demo\nPrivate steps"]), {
		presenter: null,
		demo: "",
		speakerNotes: ["Private steps"],
	});
});

test("keeps further demo markers on the same slide as speaker notes", () => {
	assert.deepEqual(parseSlidePresenterComments(["demo: First", "demo: Second"]), {
		presenter: null,
		demo: "First",
		speakerNotes: ["demo: Second"],
	});
});

test("keeps notes that only mention a demo as speaker notes", () => {
	assert.deepEqual(parseSlidePresenterComments(["demo time", "Remember the demo"]), {
		presenter: null,
		demo: null,
		speakerNotes: ["demo time", "Remember the demo"],
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
