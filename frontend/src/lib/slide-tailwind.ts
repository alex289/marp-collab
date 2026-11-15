// Loaded on demand by lib/marp.ts, so the Tailwind compiler only ships to decks
// that enable the `tailwind` directive.
import { __unstable__loadDesignSystem, compile } from "tailwindcss";
import themeCss from "tailwindcss/theme.css?raw";
import {
	compileSlideTailwind,
	TAILWIND_INPUT_CSS,
	tailwindCompileOptions,
} from "../../../shared/slide-tailwind.ts";
import type { TailwindCatalog } from "../features/editor/completions.ts";

export const loadSlideTailwind = () => compileSlideTailwind(compile, themeCss);

/**
 * Lists the classes and variants Tailwind knows for editor completions. The design
 * system API is the one Tailwind's own IntelliSense uses; it is marked unstable, so
 * slide-tailwind.test.ts in the backend guards its shape across Tailwind updates.
 */
export async function loadTailwindCatalog(): Promise<TailwindCatalog> {
	const designSystem = await __unstable__loadDesignSystem(
		TAILWIND_INPUT_CSS,
		tailwindCompileOptions(themeCss),
	);
	return {
		classes: designSystem.getClassList().map(([name]) => name),
		variants: designSystem
			.getVariants()
			.flatMap(({ name, values, hasDash }) =>
				values.length > 0 ? values.map((value) => `${name}${hasDash ? "-" : ""}${value}`) : [name],
			),
		toCss: (candidate) => designSystem.candidatesToCss([candidate])[0] ?? null,
	};
}
