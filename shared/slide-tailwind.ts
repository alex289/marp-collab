/**
 * Opt-in Tailwind CSS for slides. A deck enables it with the `tailwind: true`
 * global directive; utilities are then generated from the class attributes of the
 * rendered HTML and appended to Marp's CSS. Callers inject the Tailwind compiler
 * and its theme stylesheet so this module stays free of dependencies.
 */

export const TAILWIND_DIRECTIVE = "tailwind";

// Preflight is left out so Marp themes keep their base typography. Utilities are
// important because Marp theme CSS is unlayered and would otherwise win over every
// layered Tailwind rule, regardless of specificity.
export const TAILWIND_INPUT_CSS = `@layer theme, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) important;`;

type Stylesheet = { path: string; base: string; content: string };

export type TailwindCompileOptions = {
	base: string;
	loadStylesheet: (id: string, base: string) => Promise<Stylesheet>;
};

export type TailwindCompile = (
	css: string,
	options: TailwindCompileOptions,
) => Promise<{ build(candidates: string[]): string }>;

/** Options that resolve the stylesheets imported by TAILWIND_INPUT_CSS. */
export function tailwindCompileOptions(themeCss: string): TailwindCompileOptions {
	const stylesheets: Record<string, string> = {
		"tailwindcss/theme.css": themeCss,
		"tailwindcss/utilities.css": "@tailwind utilities;",
	};
	return {
		base: "/",
		loadStylesheet: (id, base) => {
			const content = stylesheets[id];
			return content === undefined
				? Promise.reject(new Error(`Unexpected Tailwind stylesheet: ${id}`))
				: Promise.resolve({ path: id, base, content });
		},
	};
}

/** Generates the CSS for every Tailwind class used in a rendered deck. */
export type SlideTailwind = (html: string) => string;

const classAttributeRegex = /\sclass="([^"]*)"/g;
const tagNameRegex = /^<([\w-]+)/;
const entities: Record<string, string> = { "&quot;": '"', "&#39;": "'", "&gt;": ">", "&amp;": "&" };

function decodeAttribute(value: string): string {
	return value.replace(/&(?:quot|#39|gt|amp);/g, (entity) => entities[entity]!);
}

/** Collects the class names used in rendered Marp HTML as Tailwind candidates. */
export function extractClassCandidates(html: string): string[] {
	const candidates = new Set<string>();
	for (const match of html.matchAll(classAttributeRegex)) {
		const tagStart = html.lastIndexOf("<", match.index);
		const tagName = tagNameRegex.exec(html.slice(tagStart))?.[1];
		for (const name of decodeAttribute(match[1]!).split(/\s+/)) {
			// `invert` on a slide is the Marp theme class for a dark color scheme, not
			// Tailwind's color filter. Candidates containing `<` are dropped so generated
			// CSS can never close the <style> element it ends up in.
			if (!name || name.includes("<") || (tagName === "section" && name === "invert")) {
				continue;
			}
			candidates.add(name);
		}
	}
	return [...candidates];
}

export async function compileSlideTailwind(
	compile: TailwindCompile,
	themeCss: string,
): Promise<SlideTailwind> {
	const compiler = await compile(TAILWIND_INPUT_CSS, tailwindCompileOptions(themeCss));
	return (html) => compiler.build(extractClassCandidates(html));
}
