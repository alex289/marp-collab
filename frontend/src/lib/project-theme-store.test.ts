import { deepEqual, equal } from "node:assert/strict";
import { describe, test } from "node:test";
import { createProjectThemeStore } from "./project-theme-store.ts";
import type { ProjectTheme } from "./project-themes.ts";

describe("createProjectThemeStore", () => {
	test("registers themes and bumps the revision on every change", () => {
		const registered: ProjectTheme[][] = [];
		const store = createProjectThemeStore(
			(themes) => {
				registered.push(themes);
				return ["default", ...themes.map((theme) => theme.id)];
			},
			["default"],
		);
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		const theme = { id: "theme.css", css: "section {}" };
		store.update(() => [theme]);

		deepEqual(store.getSnapshot(), {
			themes: [theme],
			names: ["default", "theme.css"],
			revision: 1,
		});
		deepEqual(registered, [[theme]]);
		equal(notifications, 1);
	});

	test("ignores updates that keep the current themes", () => {
		const store = createProjectThemeStore(() => ["default"], ["default"]);
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});
		const before = store.getSnapshot();

		store.update((current) => current);

		equal(store.getSnapshot(), before);
		equal(notifications, 0);
	});
});
