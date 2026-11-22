export const TAILWIND_DIRECTIVE = "tailwind";

// Preflight would override Marp's base typography. Utilities need !important
// because Marp's unlayered CSS wins over ordinary layered rules.
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

export type SlideTailwind = (html: string) => string;

const classAttributeRegex = /\sclass="([^"]*)"/g;
const entities: Record<string, string> = { "&quot;": '"', "&#39;": "'", "&gt;": ">", "&amp;": "&" };

// Limit compiler work per deck.
export const MAX_CLASS_CANDIDATES = 5000;
export const MAX_CLASS_CANDIDATE_LENGTH = 500;

function decodeAttribute(value: string): string {
	return value.replace(/&(?:quot|#39|gt|amp);/g, (entity) => entities[entity]!);
}

export function isTailwindCandidate(name: string): boolean {
	return (
		name.length > 0 &&
		name.length <= MAX_CLASS_CANDIDATE_LENGTH &&
		// Generated CSS is embedded in a style element. Block candidates that could close it.
		!name.includes("<") &&
		// Tailwind's invert utility would also match Marp's dark-slide class.
		// Use invert-100 for the Tailwind filter.
		name !== "invert"
	);
}

export function extractClassCandidates(html: string): string[] {
	const candidates = new Set<string>();
	for (const match of html.matchAll(classAttributeRegex)) {
		for (const name of decodeAttribute(match[1]!).split(/\s+/)) {
			if (isTailwindCandidate(name)) {
				candidates.add(name);
				if (candidates.size >= MAX_CLASS_CANDIDATES) {
					return [...candidates];
				}
			}
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
