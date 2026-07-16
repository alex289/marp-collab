import assert from "node:assert/strict";
import test from "node:test";
import { getProjectFilePresenceById } from "./project-file-presence.ts";

test("groups, deduplicates and sorts valid participants by file", () => {
	const states = [
		{ user: { id: "2", name: "Zoë", color: "#222", image: null }, activeFile: { fileId: "a.md" } },
		{
			user: { id: "1", name: "Ada", color: "#111", image: "ada.png" },
			activeFile: { fileId: "a.md" },
		},
		{ user: { id: "1", name: "Ada", color: "#111" }, activeFile: { fileId: "a.md" } },
	];

	assert.deepEqual(
		getProjectFilePresenceById(states, null)
			.get("a.md")
			?.map(({ id }) => id),
		["1", "2"],
	);
});

test("excludes the current user and malformed states", () => {
	const states = [
		{ user: { id: "self", name: "Self" }, activeFile: { fileId: "a.md" } },
		{ user: {}, activeFile: { fileId: "a.md" } },
		{ user: { id: "other", name: "Other" }, activeFile: {} },
	];
	assert.deepEqual(getProjectFilePresenceById(states, "self"), new Map());
});
