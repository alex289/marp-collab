import type {
	Completion,
	CompletionContext,
	CompletionResult,
	CompletionSection,
	CompletionSource,
} from "@codemirror/autocomplete";
import type { Text } from "@codemirror/state";
import { isCssDeckFile, isImageDeckFile, isMarkdownDeckFile } from "../../lib/file-types.ts";
import { getRelativeProjectFilePath } from "../../lib/project-file-path.ts";
import type { DeckFile } from "../../lib/types.ts";
import type { ProjectTheme } from "../../lib/project-themes.ts";
import { defaultMarpThemeName } from "../../../../shared/marp-dialect.ts";
import { MARP_ALLOWED_HTML_TAGS } from "../../lib/marp-html.ts";
import { BUILTIN_TRANSITIONS } from "../../lib/marp-transition.ts";

export type EditorCompletionConfig = {
	fileKind: "markdown" | "css";
	currentFileId: string | null;
	files: DeckFile[];
	themeNames: string[];
	projectThemes: ProjectTheme[];
	/** Loads Tailwind classes for decks with `tailwind: true`; omitted where unavailable. */
	loadTailwindCatalog?: () => Promise<TailwindCatalog>;
};

export type TailwindCatalog = {
	classes: string[];
	variants: string[];
	toCss(candidate: string): string | null;
};

type DirectiveDefinition = {
	name: string;
	detail: string;
	info: string;
	scope: "global" | "local";
	frontmatterOnly?: boolean;
};

const marpSection: CompletionSection = { name: "Marp", rank: 1 };
const marpCollabSection: CompletionSection = { name: "MarpCollab", rank: 0 };
const projectSection: CompletionSection = { name: "Project", rank: 1 };
const selectorSection: CompletionSection = { name: "Marp selectors", rank: 1 };
const htmlSection: CompletionSection = { name: "Marp HTML", rank: 1 };
const tailwindSection: CompletionSection = { name: "Tailwind", rank: 2 };

const directives: DirectiveDefinition[] = [
	{
		name: "marp",
		detail: "enable Marp",
		info: "Marks this Markdown document as a Marp presentation.",
		scope: "global",
		frontmatterOnly: true,
	},
	{
		name: "theme",
		detail: "presentation theme",
		info: "Selects a built-in or project CSS theme for the deck.",
		scope: "global",
	},
	{
		name: "size",
		detail: "slide aspect ratio",
		info: "Sets the slide size, commonly 16:9 or 4:3.",
		scope: "global",
	},
	{
		name: "math",
		detail: "math renderer",
		info: "Selects KaTeX or MathJax for mathematical expressions.",
		scope: "global",
	},
	{
		name: "lang",
		detail: "document language",
		info: "Sets the lang attribute on the generated slides.",
		scope: "global",
	},
	{
		name: "tailwind",
		detail: "Tailwind CSS classes",
		info: "Generates Tailwind CSS utilities for the classes used in this deck.",
		scope: "global",
	},
	{
		name: "headingDivider",
		detail: "heading slide breaks",
		info: "Starts a new slide automatically at the selected heading levels.",
		scope: "global",
	},
	{
		name: "style",
		detail: "deck CSS",
		info: "Adds CSS that applies to the presentation.",
		scope: "global",
	},
	{
		name: "paginate",
		detail: "page numbers",
		info: "Shows page numbers. Use hold or skip to control number increments.",
		scope: "local",
	},
	{
		name: "header",
		detail: "slide header",
		info: "Sets Markdown content rendered in the slide header.",
		scope: "local",
	},
	{
		name: "footer",
		detail: "slide footer",
		info: "Sets Markdown content rendered in the slide footer.",
		scope: "local",
	},
	{
		name: "class",
		detail: "slide CSS classes",
		info: "Adds one or more CSS classes to the slide section.",
		scope: "local",
	},
	{
		name: "color",
		detail: "text color",
		info: "Sets the base text color for the slide.",
		scope: "local",
	},
	{
		name: "backgroundColor",
		detail: "background color",
		info: "Sets the slide background color.",
		scope: "local",
	},
	{
		name: "backgroundImage",
		detail: "background image",
		info: "Sets a CSS background image for the slide.",
		scope: "local",
	},
	{
		name: "backgroundPosition",
		detail: "background position",
		info: "Controls the position of the slide background image.",
		scope: "local",
	},
	{
		name: "backgroundRepeat",
		detail: "background repeat",
		info: "Controls how the slide background image repeats.",
		scope: "local",
	},
	{
		name: "backgroundSize",
		detail: "background size",
		info: "Controls how the slide background image is sized.",
		scope: "local",
	},
	{
		name: "transition",
		detail: "slide transition",
		info: "Animates moving on from this slide while presenting, e.g. fade 1s. Themes can add their own with marp-transition-<name> keyframes.",
		scope: "local",
	},
];

const marpSelectors = [
	"section",
	"section::after",
	"section::before",
	"header",
	"footer",
	"h1",
	"h2",
	"h3",
	"p",
	"blockquote",
	"pre",
	"code",
	"table",
];

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}

export function extractThemeClassNames(css: string): string[] {
	const classes: string[] = [];
	const scannableCss = maskCssCommentsAndStrings(css);
	const openingBraceRegex = /\{/g;
	let openingBrace = openingBraceRegex.exec(scannableCss);

	while (openingBrace) {
		const boundary = Math.max(
			scannableCss.lastIndexOf("{", openingBrace.index - 1),
			scannableCss.lastIndexOf("}", openingBrace.index - 1),
		);
		const selector = scannableCss.slice(boundary + 1, openingBrace.index).trim();
		if (!selector.startsWith("@")) {
			const classRegex = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
			let classMatch = classRegex.exec(selector);
			while (classMatch) {
				if (classMatch[1]) {
					classes.push(classMatch[1]);
				}
				classMatch = classRegex.exec(selector);
			}
		}
		openingBrace = openingBraceRegex.exec(scannableCss);
	}

	return unique(classes);
}

function allThemeClassNames(config: EditorCompletionConfig): string[] {
	return unique([
		"lead",
		"invert",
		...config.projectThemes.flatMap((theme) => extractThemeClassNames(theme.css)),
	]);
}

function lineBeforeCursor(context: CompletionContext): string {
	const line = context.state.doc.lineAt(context.pos);
	return line.text.slice(0, context.pos - line.from);
}

function isInsideFrontmatter(context: CompletionContext): boolean {
	const { doc } = context.state;
	if (doc.lines === 0 || doc.line(1).text.trim() !== "---") {
		return false;
	}

	for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
		const line = doc.line(lineNumber);
		if (line.from > context.pos) {
			return true;
		}
		if (line.text.trim() === "---") {
			return context.pos < line.from;
		}
	}

	return true;
}

/** HTML comments with a meaning in MarpCollab beyond Marp's own directives. */
const marpCollabComments: Completion[] = [
	{
		label: "@include",
		apply: "@include: ",
		type: "keyword",
		detail: "insert slides from another file",
		info: "Inserts the slides of another Markdown file in this project, relative to this file.",
		section: marpCollabSection,
	},
	{
		label: "presenter",
		apply: "presenter: ",
		type: "keyword",
		detail: "who presents this slide",
		info: "Shows the presenter's name and avatar in the presenter view.",
		section: marpCollabSection,
	},
	{
		label: "demo",
		apply: "demo: ",
		type: "keyword",
		detail: "live demo slide",
		info: "Marks this slide as a live demo. The title on the first line is shown to the audience; press L in the presenter view to start it.",
		section: marpCollabSection,
	},
	{
		label: "section",
		apply: "section: ",
		type: "keyword",
		detail: "named group of slides",
		info: "Starts a named section at this slide in the slide overview. Put it at the top of the slide.",
		section: marpCollabSection,
	},
];

function directiveKeyCompletion(context: CompletionContext): CompletionResult | null {
	const line = lineBeforeCursor(context);
	const frontmatter = isInsideFrontmatter(context);
	const match = frontmatter
		? /^\s*(_?[A-Za-z][\w-]*|_)?$/.exec(line)
		: /^\s*<!--\s*(@[\w-]*|_?[A-Za-z][\w-]*|_)?$/.exec(line);
	const typed = match?.[1] ?? "";

	if (!match || (!typed && !context.explicit) || (frontmatter && typed.startsWith("@"))) {
		return null;
	}

	const options: Completion[] = frontmatter ? [] : [...marpCollabComments];
	for (const directive of directives) {
		if (!frontmatter && (directive.frontmatterOnly || directive.scope === "global")) {
			continue;
		}
		options.push({
			label: directive.name,
			apply: `${directive.name}: `,
			type: "property",
			detail: directive.detail,
			info: directive.info,
			section: marpSection,
		});
		if (!frontmatter && directive.scope === "local") {
			options.push({
				label: `_${directive.name}`,
				apply: `_${directive.name}: `,
				type: "property",
				detail: `current slide · ${directive.detail}`,
				info: `The underscore limits this directive to the current slide. ${directive.info}`,
				section: marpSection,
			});
		}
	}

	return {
		from: context.pos - typed.length,
		options,
		validFor: /^[@_]?[\w-]*$/,
	};
}

function valueOptions(name: string, config: EditorCompletionConfig): Completion[] {
	const option = (label: string, detail: string): Completion => ({
		label,
		type: "enum",
		detail,
		section: marpSection,
	});

	switch (name.replace(/^_/, "")) {
		case "marp":
			return [option("true", "enable Marp")];
		case "theme":
			return unique(config.themeNames).map((name) => option(name, "registered theme"));
		case "size":
			return [option("16:9", "widescreen"), option("4:3", "standard")];
		case "math":
			return [option("katex", "KaTeX"), option("mathjax", "MathJax")];
		case "tailwind":
			return [option("true", "enable Tailwind CSS"), option("false", "disable Tailwind CSS")];
		case "headingDivider":
			return ["false", "1", "2", "3", "4", "5", "6", "[1, 2]"].map((value) =>
				option(value, "heading level"),
			);
		case "paginate":
			return [
				option("true", "show page numbers"),
				option("false", "hide page numbers"),
				option("hold", "show without incrementing"),
				option("skip", "hide without incrementing"),
			];
		case "backgroundPosition":
			return ["center", "top", "right", "bottom", "left"].map((value) =>
				option(value, "CSS position"),
			);
		case "backgroundRepeat":
			return ["no-repeat", "repeat", "repeat-x", "repeat-y"].map((value) =>
				option(value, "CSS repeat mode"),
			);
		case "backgroundSize":
			return ["cover", "contain", "auto"].map((value) => option(value, "CSS size"));
		case "transition":
			return [...BUILTIN_TRANSITIONS, "none"].map((value) =>
				option(value, value === "none" ? "no transition" : "built-in transition"),
			);
		case "backgroundColor":
		case "color":
			return ["black", "white", "transparent", "currentColor"].map((value) =>
				option(value, "CSS color"),
			);
		default:
			return [];
	}
}

function directiveValueCompletion(
	context: CompletionContext,
	config: EditorCompletionConfig,
): CompletionResult | Promise<CompletionResult> | null {
	const line = lineBeforeCursor(context);
	const frontmatter = isInsideFrontmatter(context);
	const match = frontmatter
		? /^\s*(_?[A-Za-z][\w-]*)\s*:\s*["']?([^"']*)$/.exec(line)
		: /^\s*<!--\s*(_?[A-Za-z][\w-]*)\s*:\s*["']?([^"']*)$/.exec(line);

	if (!match?.[1]) {
		return null;
	}
	const normalizedName = match[1].replace(/^_/, "");
	const definition = directives.find((directive) => directive.name === normalizedName);
	if (
		!definition ||
		(frontmatter && match[1].startsWith("_")) ||
		(!frontmatter && definition.scope === "global")
	) {
		return null;
	}

	const typed = match[2] ?? "";
	if (normalizedName === "class") {
		return classCompletion(context, config, /[^\s,[]*$/.exec(typed)?.[0] ?? "");
	}

	const options = valueOptions(match[1], config);
	if (options.length === 0) {
		return null;
	}

	return {
		from: context.pos - typed.length,
		options,
		validFor: /^[\w:[\], -]*$/,
	};
}

type PathContext = {
	from: number;
	fragment: string;
	fileKind: "any" | "asset" | "css" | "image" | "markdown";
	includeThemeNames?: boolean;
	wrapInUrl?: boolean;
};

function markdownPathContext(context: CompletionContext): PathContext | null {
	const line = lineBeforeCursor(context);
	const markdownLink = /(!?)\[[^\]\n]*\]\(\s*<?([^)>\s]*)$/.exec(line);
	if (markdownLink) {
		const fragment = markdownLink[2] ?? "";
		return {
			from: context.pos - fragment.length,
			fragment,
			fileKind: markdownLink[1] === "!" ? "image" : "any",
		};
	}

	const htmlAsset = /<(img|video|source)\b[^>]*\b(?:src|poster)=["']([^"']*)$/i.exec(line);
	if (htmlAsset) {
		const fragment = htmlAsset[2] ?? "";
		return {
			from: context.pos - fragment.length,
			fragment,
			fileKind: htmlAsset[1]?.toLowerCase() === "img" ? "image" : "asset",
		};
	}

	const include = /^\s*<!--\s*@include\s*:\s*([^\s>]*)$/.exec(line);
	if (include) {
		const fragment = include[1] ?? "";
		return { from: context.pos - fragment.length, fragment, fileKind: "markdown" };
	}

	const background = /_?backgroundImage\s*:\s*(url\(\s*)?["']?([^"')\s<>]*)$/i.exec(line);
	if (background) {
		const fragment = background[2] ?? "";
		return {
			from: context.pos - fragment.length,
			fragment,
			fileKind: "image",
			wrapInUrl: !background[1],
		};
	}

	return null;
}

function cssPathContext(context: CompletionContext): PathContext | null {
	const line = lineBeforeCursor(context);
	const url = /\burl\(\s*["']?([^"')\s]*)$/i.exec(line);
	if (url) {
		const fragment = url[1] ?? "";
		return { from: context.pos - fragment.length, fragment, fileKind: "asset" };
	}

	const cssImport = /@import\s+(?:url\(\s*)?["']([^"']*)$/i.exec(line);
	if (cssImport) {
		const fragment = cssImport[1] ?? "";
		return {
			from: context.pos - fragment.length,
			fragment,
			fileKind: "css",
			includeThemeNames: true,
		};
	}

	return null;
}

function pathCompletion(
	config: EditorCompletionConfig,
	pathContext: PathContext | null,
): CompletionResult | null {
	if (!pathContext || /^(?:[a-z]+:|\/\/|#)/i.test(pathContext.fragment)) {
		return null;
	}

	const rootStyle = pathContext.fragment.startsWith("/");
	const dotStyle = pathContext.fragment.startsWith("./");
	const options: Completion[] = [];
	const seen = new Set<string>();
	if (pathContext.includeThemeNames && !rootStyle && !dotStyle) {
		for (const themeName of unique(config.themeNames)) {
			seen.add(themeName);
			options.push({
				label: themeName,
				apply: themeName,
				type: "namespace",
				detail: "registered Marp theme",
				section: marpSection,
			});
		}
	}

	for (const file of config.files) {
		if (
			file.type === "folder" ||
			file.id === config.currentFileId ||
			(pathContext.fileKind === "asset" && file.type !== "asset") ||
			(pathContext.fileKind === "image" && !isImageDeckFile(file)) ||
			(pathContext.fileKind === "css" && !isCssDeckFile(file)) ||
			(pathContext.fileKind === "markdown" && !isMarkdownDeckFile(file))
		) {
			continue;
		}

		const relative = getRelativeProjectFilePath(config.currentFileId, file.id);
		const path = rootStyle
			? `/${file.id.replace(/^\/+/, "")}`
			: dotStyle && !relative.startsWith("..")
				? `./${relative}`
				: relative;
		if (seen.has(path)) {
			continue;
		}
		seen.add(path);
		options.push({
			label: path,
			apply: pathContext.wrapInUrl ? `url("${path}")` : path,
			type: "text",
			detail: file.type === "asset" ? "project asset" : "project file",
			section: projectSection,
		});
	}

	if (options.length === 0) {
		return null;
	}

	return {
		from: pathContext.from,
		options,
		validFor: /^[^\s)>'"]*$/,
	};
}

function htmlClassCompletion(
	context: CompletionContext,
	config: EditorCompletionConfig,
): CompletionResult | Promise<CompletionResult> | null {
	const match = /<[A-Za-z][^>]*\bclass=["']([^"']*)$/i.exec(lineBeforeCursor(context));
	if (!match) {
		return null;
	}
	return classCompletion(context, config, /\S*$/.exec(match[1] ?? "")?.[0] ?? "");
}

const tailwindFrontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
const tailwindDirectiveLineRegex = /^tailwind\s*:\s*(["']?)true\1\s*$/m;
const tailwindDirectiveCommentRegex = /<!--\s*tailwind\s*:\s*(["']?)true\1\s*-->/;
const tailwindDocs = new WeakMap<Text, boolean>();

function isTailwindEnabled(doc: Text): boolean {
	let enabled = tailwindDocs.get(doc);
	if (enabled === undefined) {
		const source = doc.toString();
		const frontmatter = tailwindFrontmatterRegex.exec(source)?.[1];
		enabled =
			(frontmatter !== undefined && tailwindDirectiveLineRegex.test(frontmatter)) ||
			tailwindDirectiveCommentRegex.test(source);
		tailwindDocs.set(doc, enabled);
	}
	return enabled;
}

/** Length of the variant prefix (e.g. `md:hover:`) before the utility being typed. */
function variantPrefixLength(token: string): number {
	let depth = 0;
	let end = 0;
	for (let index = 0; index < token.length; index += 1) {
		const char = token[index];
		if (char === "[") {
			depth += 1;
		} else if (char === "]") {
			depth = Math.max(0, depth - 1);
		} else if (char === ":" && depth === 0) {
			end = index + 1;
		}
	}
	return end;
}

type TailwindOptions = { utilities: Completion[]; negative: Completion[] };
const tailwindOptionCache = new WeakMap<TailwindCatalog, TailwindOptions>();

function tailwindOptions(catalog: TailwindCatalog): TailwindOptions {
	let options = tailwindOptionCache.get(catalog);
	if (!options) {
		const info = (completion: Completion) => {
			const css = catalog.toCss(completion.label);
			if (!css) {
				return null;
			}
			const pre = document.createElement("pre");
			pre.style.margin = "0";
			pre.textContent = css;
			return pre;
		};
		const classes = catalog.classes.map((label): Completion => ({
			label,
			type: "class",
			section: tailwindSection,
			info,
		}));
		options = {
			utilities: [
				...classes.filter((option) => !option.label.startsWith("-")),
				...catalog.variants.map((variant): Completion => ({
					label: `${variant}:`,
					type: "keyword",
					detail: "variant",
					section: tailwindSection,
					boost: -1,
				})),
			],
			negative: classes.filter((option) => option.label.startsWith("-")),
		};
		tailwindOptionCache.set(catalog, options);
	}
	return options;
}

/** Offer negative Tailwind utilities only after the user types a leading minus. */
function classCompletion(
	context: CompletionContext,
	config: EditorCompletionConfig,
	token: string,
): CompletionResult | Promise<CompletionResult> {
	const fragment = token.slice(variantPrefixLength(token));
	const negative = fragment.startsWith("-");
	const result = (tailwind: Completion[]): CompletionResult => ({
		from: context.pos - fragment.length,
		options: [
			...(negative
				? []
				: allThemeClassNames(config).map((name): Completion => ({
						label: name,
						type: "class",
						detail: "theme class",
						section: marpSection,
					}))),
			...tailwind,
		],
		validFor: negative ? /^-[\w./-]*$/ : /^(?:[\w./][\w./-]*)?$/,
	});

	const { loadTailwindCatalog } = config;
	if (!loadTailwindCatalog || !isTailwindEnabled(context.state.doc)) {
		return result([]);
	}
	return (async () => {
		try {
			const options = tailwindOptions(await loadTailwindCatalog());
			return result(negative ? options.negative : options.utilities);
		} catch {
			return result([]);
		}
	})();
}

function isInsideMarkdownFence(context: CompletionContext): boolean {
	const { doc } = context.state;
	const cursorLine = doc.lineAt(context.pos).number;
	let fence: { marker: "`" | "~"; length: number } | null = null;

	for (let lineNumber = 1; lineNumber <= cursorLine; lineNumber += 1) {
		const match = /^\s{0,3}(`{3,}|~{3,})/.exec(doc.line(lineNumber).text);
		const marker = match?.[1];
		if (!marker) {
			continue;
		}

		const markerCharacter = marker[0] as "`" | "~";
		if (!fence) {
			fence = { marker: markerCharacter, length: marker.length };
		} else if (markerCharacter === fence.marker && marker.length >= fence.length) {
			fence = null;
		}
	}

	return fence !== null;
}

function htmlTagCompletion(context: CompletionContext): CompletionResult | null {
	const beforeCursor = context.state.sliceDoc(0, context.pos);
	if (
		beforeCursor.lastIndexOf("<!--") > beforeCursor.lastIndexOf("-->") ||
		isInsideMarkdownFence(context)
	) {
		return null;
	}

	const match = /<([A-Za-z][\w-]*)?$/.exec(lineBeforeCursor(context));
	if (!match) {
		return null;
	}

	const typed = match[1] ?? "";
	return {
		from: context.pos - typed.length,
		options: MARP_ALLOWED_HTML_TAGS.map((tag) => ({
			label: tag,
			type: "type",
			detail: "allowed by Marp",
			section: htmlSection,
		})),
		validFor: /^[\w-]*$/,
	};
}

function cssThemeMarkerCompletion(
	context: CompletionContext,
	config: EditorCompletionConfig,
): CompletionResult | null {
	const line = lineBeforeCursor(context);
	const match = /^\s*\/\*\s*(@[\w-]*)$/.exec(line);
	if (!match?.[1] || !"@theme".startsWith(match[1])) {
		return null;
	}

	const baseName = defaultMarpThemeName(config.currentFileId ?? "");
	return {
		from: context.pos - match[1].length,
		options: [
			{
				label: "@theme",
				apply: `@theme ${baseName} */`,
				type: "keyword",
				detail: "name this Marp theme",
				section: marpSection,
			},
		],
		validFor: /^@[\w-]*$/,
	};
}

function cssBraceDepth(source: string): number {
	const scannableCss = maskCssCommentsAndStrings(source);
	let depth = 0;
	for (const char of scannableCss) {
		if (char === "{") {
			depth += 1;
		}
		if (char === "}") {
			depth = Math.max(0, depth - 1);
		}
	}
	return depth;
}

function maskCssCommentsAndStrings(source: string): string {
	const masked = source.split("");
	const mask = (index: number) => {
		if (masked[index] !== "\n" && masked[index] !== "\r") {
			masked[index] = " ";
		}
	};

	let index = 0;
	while (index < source.length) {
		if (source[index] === "/" && source[index + 1] === "*") {
			mask(index);
			mask(index + 1);
			index += 2;
			while (index < source.length) {
				const closesComment = source[index] === "*" && source[index + 1] === "/";
				mask(index);
				if (closesComment) {
					mask(index + 1);
					index += 2;
					break;
				}
				index += 1;
			}
			continue;
		}

		const quote = source[index];
		if (quote === '"' || quote === "'") {
			mask(index);
			index += 1;
			while (index < source.length) {
				if (source[index] === "\\") {
					mask(index);
					if (index + 1 < source.length) {
						mask(index + 1);
					}
					index += 2;
					continue;
				}
				const closesString = source[index] === quote;
				mask(index);
				index += 1;
				if (closesString) {
					break;
				}
			}
			continue;
		}

		index += 1;
	}

	return masked.join("");
}

function cssSelectorCompletion(
	context: CompletionContext,
	config: EditorCompletionConfig,
): CompletionResult | null {
	if (cssBraceDepth(context.state.sliceDoc(0, context.pos)) !== 0) {
		return null;
	}

	const line = lineBeforeCursor(context);
	const match = /(?:^|,\s*)([.#:]?[\w-]*(?:\.[\w-]*)?)$/.exec(line);
	const typed = match?.[1] ?? "";
	if (!match || (!typed && !context.explicit)) {
		return null;
	}

	const selectors = unique([
		...marpSelectors,
		...allThemeClassNames(config).flatMap((name) => [`.${name}`, `section.${name}`]),
	]);

	return {
		from: context.pos - typed.length,
		options: selectors.map((selector) => ({
			label: selector,
			apply: selector,
			type: "class",
			detail: "slide theme selector",
			section: selectorSection,
		})),
		validFor: /^[.#:\w-]*$/,
	};
}

function markdownCompletion(
	context: CompletionContext,
	config: EditorCompletionConfig,
): CompletionResult | Promise<CompletionResult> | null {
	return (
		pathCompletion(config, markdownPathContext(context)) ??
		htmlClassCompletion(context, config) ??
		htmlTagCompletion(context) ??
		directiveValueCompletion(context, config) ??
		directiveKeyCompletion(context)
	);
}

function cssCompletion(
	context: CompletionContext,
	config: EditorCompletionConfig,
): CompletionResult | null {
	return (
		pathCompletion(config, cssPathContext(context)) ??
		cssThemeMarkerCompletion(context, config) ??
		cssSelectorCompletion(context, config)
	);
}

export function createEditorCompletionSource(
	getConfig: () => EditorCompletionConfig,
): CompletionSource {
	return (context) => {
		const config = getConfig();
		return config.fileKind === "css"
			? cssCompletion(context, config)
			: markdownCompletion(context, config);
	};
}
