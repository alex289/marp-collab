import { deepEqual } from "node:assert/strict";
import { describe, test } from "node:test";
import { filterAndSortProjects, type ProjectSortOption } from "./project-list.ts";

const projects = [
	{
		name: "Gamma 10",
		createdAt: "2026-01-03T00:00:00.000Z",
		updatedAt: "2026-01-04T00:00:00.000Z",
	},
	{
		name: "alpha",
		createdAt: "2026-01-02T00:00:00.000Z",
		updatedAt: "2026-01-06T00:00:00.000Z",
	},
	{
		name: "Gamma 2",
		createdAt: "2026-01-05T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];

function select(query: string, sortOption: ProjectSortOption) {
	return filterAndSortProjects(projects, query, sortOption, (project) => project).map(
		(project) => project.name,
	);
}

describe("project list filtering and sorting", () => {
	test("searches project names case-insensitively and ignores surrounding whitespace", () => {
		deepEqual(select("  GAMMA ", "created"), ["Gamma 2", "Gamma 10"]);
	});

	test("sorts newest-created projects first", () => {
		deepEqual(select("", "created"), ["Gamma 2", "Gamma 10", "alpha"]);
	});

	test("sorts newest-updated projects first", () => {
		deepEqual(select("", "updated"), ["alpha", "Gamma 10", "Gamma 2"]);
	});

	test("sorts project names alphabetically with numeric awareness", () => {
		deepEqual(select("", "alphabetical"), ["alpha", "Gamma 2", "Gamma 10"]);
	});
});
