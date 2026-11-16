import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "tailwindcss";
import { compileSlideTailwind, type SlideTailwind } from "../../../shared/slide-tailwind.ts";

// The production bundle ships without node_modules, so the build copies Tailwind's
// theme next to the other assets (see rolldown.config.ts).
const themeCssPaths = ["assets/tailwind/theme.css", "node_modules/tailwindcss/theme.css"].map(
	(path) => resolve(process.cwd(), path),
);

let themeCss: string | undefined;

function readThemeCss(): string {
	if (themeCss === undefined) {
		const path = themeCssPaths.find((candidate) => existsSync(candidate));
		if (!path) {
			throw new Error("Tailwind theme stylesheet not found");
		}
		themeCss = readFileSync(path, "utf8");
	}
	return themeCss;
}

/**
 * Creates a fresh compiler per call: Tailwind's compiler accumulates every class it
 * has seen, and a shared one would leak class names between decks of other users.
 */
export function createSlideTailwind(): Promise<SlideTailwind> {
	return compileSlideTailwind(compile, readThemeCss());
}
