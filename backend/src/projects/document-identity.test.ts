import { describe, test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
	documentBelongsToProject,
	parseProjectDocumentName,
	toDocumentName,
} from "./document-identity.ts";

describe("Project Document Identity", () => {
	test("roundtrips a nested file identity", () => {
		const name = toDocumentName("project-1", "theme/custom.css");
		equal(name, "project/project-1/theme/custom.css");
		deepEqual(parseProjectDocumentName(name), {
			projectId: "project-1",
			fileId: "theme/custom.css",
		});
	});

	test("rejects names outside the Project grammar", () => {
		equal(parseProjectDocumentName("other/project-1/slides.md"), null);
		equal(parseProjectDocumentName("project//slides.md"), null);
	});

	test("compares Project membership by parsed identity", () => {
		equal(documentBelongsToProject("project/project-1/slides.md", "project-1"), true);
		equal(documentBelongsToProject("project/project-10/slides.md", "project-1"), false);
		equal(documentBelongsToProject("project/project-1", "project-1"), false);
	});
});
