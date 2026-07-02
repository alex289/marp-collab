import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { upsertProjectTheme } from "./project-themes.ts";

test("upsertProjectTheme replaces CSS for an existing theme file", () => {
	const existing = [
		{ id: "base.css", css: "/* @theme base */\nsection { color: white; }" },
		{ id: "custom.css", css: "/* @theme custom */\nsection { background: red; }" },
	];

	const next = upsertProjectTheme(existing, {
		id: "custom.css",
		css: "/* @theme custom */\nsection { background: blue; }",
	});

	deepStrictEqual(next, [
		{ id: "base.css", css: "/* @theme base */\nsection { color: white; }" },
		{ id: "custom.css", css: "/* @theme custom */\nsection { background: blue; }" },
	]);
});

test("upsertProjectTheme preserves state identity when CSS is unchanged", () => {
	const existing = [{ id: "custom.css", css: "/* @theme custom */" }];

	const next = upsertProjectTheme(existing, { id: "custom.css", css: "/* @theme custom */" });

	strictEqual(next, existing);
});
