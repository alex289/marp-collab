import type {
	Completion,
	CompletionContext,
	CompletionResult,
	CompletionSection,
	CompletionSource,
} from "@codemirror/autocomplete";
import type { DeckFile } from "../../lib/types.ts";
import type { ProjectTheme } from "../../lib/project-themes.ts";

export type EditorCompletionConfig = {
	fileKind: "markdown" | "css";
	currentFileId: string | null;
	files: DeckFile[];
	themeNames: string[];
	projectThemes: ProjectTheme[];
};

type DirectiveDefinition = {
	name: string;
	detail: string;
	info: string;
	scope: "global" | "local";
	frontmatterOnly?: boolean;
};

const marpSection: CompletionSection = { name: "Marp", rank: 1 };
const projectSection: CompletionSection = { name: "Project", rank: 1 };
const selectorSection: CompletionSection = { name: "Marp selectors", rank: 1 };

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
];

const imageExtensions = new Set(["bmp", "gif", "jpeg", "jpg", "png", "svg", "tiff", "webp"]);

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

function fileExtension(fileId: string): string {
	const dot = fileId.lastIndexOf(".");
	return dot === -1 ? "" : fileId.slice(dot + 1).toLowerCase();
}

function isImageFile(file: DeckFile): boolean {
	return imageExtensions.has(fileExtension(file.id));
}

function currentDirectory(fileId: string | null): string[] {
	if (!fileId) {
		return [];
	}
	const parts = fileId.replace(/^\/+|\/+$/g, "").split("/");
	return parts.slice(0, -1);
}

export function relativeProjectPath(currentFileId: string | null, targetFileId: string): string {
	const from = currentDirectory(currentFileId);
	const to = targetFileId.replace(/^\/+|\/+$/g, "").split("/");
	let commonLength = 0;

	while (from[commonLength] === to[commonLength] && commonLength < from.length) {
		commonLength += 1;
	}

	return [
		...Array.from({ length: from.length - commonLength }, () => ".."),
		...to.slice(commonLength),
	].join("/");
}

export function extractThemeClassNames(css: string): string[] {
	const classes: string[] = [];
	const openingBraceRegex = /\{/g;
	let openingBrace = openingBraceRegex.exec(css);

	while (openingBrace) {
		const boundary = Math.max(
			css.lastIndexOf("{", openingBrace.index - 1),
			css.lastIndexOf("}", openingBrace.index - 1),
		);
		const selector = css.slice(boundary + 1, openingBrace.index).trim();
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
		openingBrace = openingBraceRegex.exec(css);
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

function directiveKeyCompletion(context: CompletionContext): CompletionResult | null {
	const line = lineBeforeCursor(context);
	const frontmatter = isInsideFrontmatter(context);
	const match = frontmatter
		? /^\s*(_?[A-Za-z][\w-]*|_)?$/.exec(line)
		: /^\s*<!--\s*(_?[A-Za-z][\w-]*|_)?$/.exec(line);
	const typed = match?.[1] ?? "";

	if (!match || (!typed && !context.explicit)) {
		return null;
	}

	const options: Completion[] = [];
	for (const directive of directives) {
		if (!frontmatter && directive.frontmatterOnly) {
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
		if (directive.scope === "local") {
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
		validFor: /^_?[\w-]*$/,
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
		case "class":
			return allThemeClassNames(config).map((name) => option(name, "theme class"));
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
): CompletionResult | null {
	const line = lineBeforeCursor(context);
	const frontmatter = isInsideFrontmatter(context);
	const match = frontmatter
		? /^\s*(_?[A-Za-z][\w-]*)\s*:\s*["']?([^"']*)$/.exec(line)
		: /^\s*<!--\s*(_?[A-Za-z][\w-]*)\s*:\s*["']?([^"']*)$/.exec(line);

	if (!match?.[1]) {
		return null;
	}

	let typed = match[2] ?? "";
	const options = valueOptions(match[1], config);
	if (options.length === 0) {
		return null;
	}

	if (match[1].replace(/^_/, "") === "class") {
		typed = /[\w-]*$/.exec(typed)?.[0] ?? typed;
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
	fileKind: "any" | "asset" | "css" | "image";
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
			(pathContext.fileKind === "image" && !isImageFile(file)) ||
			(pathContext.fileKind === "css" && fileExtension(file.id) !== "css")
		) {
			continue;
		}

		const relative = relativeProjectPath(config.currentFileId, file.id);
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
): CompletionResult | null {
	const match = /<[A-Za-z][^>]*\bclass=["']([^"']*)$/i.exec(lineBeforeCursor(context));
	if (!match) {
		return null;
	}

	const typed = /[\w-]*$/.exec(match[1] ?? "")?.[0] ?? "";
	return {
		from: context.pos - typed.length,
		options: allThemeClassNames(config).map((name) => ({
			label: name,
			type: "class",
			detail: "project theme class",
			section: selectorSection,
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

	const baseName =
		config.currentFileId
			?.split("/")
			.pop()
			?.replace(/\.css$/i, "")
			.toLowerCase()
			.replace(/[^\w-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "theme";
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
	const withoutCommentsAndStrings = source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(["'])(?:\\.|(?!\1).)*\1/g, "");
	let depth = 0;
	for (const char of withoutCommentsAndStrings) {
		if (char === "{") {
			depth += 1;
		}
		if (char === "}") {
			depth = Math.max(0, depth - 1);
		}
	}
	return depth;
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
): CompletionResult | null {
	return (
		pathCompletion(config, markdownPathContext(context)) ??
		htmlClassCompletion(context, config) ??
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
