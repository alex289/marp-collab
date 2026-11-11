const MAX_DEPTH = 10;
const MAX_INCLUDES = 100;
const MAX_CHARACTERS = 1_000_000;
const marker = /^ {0,3}<!--\s*@include:[\t ]*([^\r\n]+?)\s*-->[\t ]*\r?$/;
const frontmatter = /^\uFEFF?---\r?\n(?:[^\r\n]*\r?\n)*?(?:---[\t ]*|\.\.\.)(?:\r?\n|$)/;

function error(message: string): string {
	return `> ⚠️ **Include error:** ${message}`;
}

/** Only standalone comments outside fenced code blocks are executable. */
function includeLines(markdown: string): Map<number, string> {
	const includes = new Map<number, string>();
	let fence: string | undefined;
	for (const [index, line] of markdown.split("\n").entries()) {
		const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (delimiter) {
			if (!fence) {
				fence = delimiter[1];
			} else if (
				delimiter[1]![0] === fence[0] &&
				delimiter[1]!.length >= fence.length &&
				!delimiter[2]!.trim()
			) {
				fence = undefined;
			}
			continue;
		}
		if (!fence) {
			const match = marker.exec(line);
			if (match) {
				includes.set(index, match[1]!.trim());
			}
		}
	}
	return includes;
}

export function hasMarkdownIncludes(markdown: string): boolean {
	return includeLines(markdown).size > 0;
}

function resolveIncludePath(parent: string, path: string): string | undefined {
	if (/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(path) || /[\\?#]/.test(path) || path.includes("\0")) {
		return;
	}
	const parts = parent.split("/").slice(0, -1);
	for (const part of path.split("/")) {
		if (part === "..") {
			if (!parts.length) {
				return;
			}
			parts.pop();
		} else if (part && part !== ".") {
			parts.push(part);
		}
	}
	return parts.join("/");
}

/** Shared by preview and PDF export. Reads are cached only for this expansion. */
export async function expandMarkdownIncludes(
	markdown: string,
	currentFileId: string,
	readFile: (fileId: string) => Promise<string | undefined>,
	onSourceLines?: (lines: number[]) => void,
): Promise<string> {
	let count = 0;
	let characters = markdown.length;
	const cache = new Map<string, Promise<string | undefined>>();
	async function expand(
		source: string,
		parent: string,
		ancestors: ReadonlySet<string>,
		depth: number,
	): Promise<string> {
		const includes = includeLines(source);
		const lines = source.split("\n");
		for (const [index, path] of includes) {
			const fileId = resolveIncludePath(parent, path);
			if (!fileId) {
				lines[index] = error("invalid include path");
			} else if (!/\.(md|markdown)$/i.test(fileId)) {
				lines[index] = error("only Markdown files can be included");
			} else if (depth >= MAX_DEPTH) {
				lines[index] = error("include depth limit reached");
			} else if (ancestors.has(fileId)) {
				lines[index] = error("circular include");
			} else if (++count > MAX_INCLUDES || characters > MAX_CHARACTERS) {
				lines[index] = error("include size limit reached");
			} else {
				let pending = cache.get(fileId);
				if (!pending) {
					pending = readFile(fileId);
					cache.set(fileId, pending);
				}
				const content = await pending;
				characters += content?.length ?? 0;
				lines[index] =
					content === undefined
						? error("file not found")
						: characters > MAX_CHARACTERS
							? error("include size limit reached")
							: await expand(
									content.replace(frontmatter, ""),
									fileId,
									new Set([...ancestors, fileId]),
									depth + 1,
								);
			}
		}
		if (depth === 0) {
			onSourceLines?.(lines.flatMap((line, index) => line.split("\n").map(() => index + 1)));
		}
		return lines.join("\n");
	}
	return await expand(markdown, currentFileId, new Set([currentFileId]), 0);
}
