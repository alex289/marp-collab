// Tracks fenced code blocks so slide dividers inside code are ignored.
type Fence = {
	marker: "`" | "~";
	length: number;
};

function getFence(line: string): Fence | null {
	const match = line.match(/^\s*(`{3,}|~{3,})/);

	if (!match) {
		return null;
	}

	const sequence = match[1];

	return {
		marker: sequence[0] as Fence["marker"],
		length: sequence.length,
	};
}

function closesFence(line: string, fence: Fence): boolean {
	const match = line.match(/^\s*(`{3,}|~{3,})([ \t]*)$/);

	if (!match) {
		return false;
	}

	const sequence = match[1];

	return sequence[0] === fence.marker && sequence.length >= fence.length;
}

const isDivider = (line: string) => /^\s*-{3,}\s*$/.test(line);

/**
 * Counts Marp slides directly from the Markdown source, by counting `---`
 * dividers outside of code fences (Marp's own frontmatter delimiters are
 * skipped, not counted as dividers). Slide count is `dividers + 1`.
 */
export function countMarpSlides(markdown: string): number {
	const lines = markdown.split(/\r\n|\n|\r/);
	let startIndex = 0;

	// YAML front matter is delimited by `---` (closed by `---` or `...`) at
	// the very start of the document; those lines are not slide dividers.
	if (lines[0]?.trim() === "---") {
		for (let index = 1; index < lines.length; index += 1) {
			const trimmed = lines[index].trim();

			if (trimmed === "---" || trimmed === "...") {
				startIndex = index + 1;
				break;
			}
		}
	}

	let dividerCount = 0;
	let fence: Fence | null = null;

	for (let index = startIndex; index < lines.length; index += 1) {
		const line = lines[index];

		if (fence) {
			if (closesFence(line, fence)) {
				fence = null;
			}
			continue;
		}

		const nextFence = getFence(line);
		if (nextFence) {
			fence = nextFence;
			continue;
		}

		if (isDivider(line)) {
			dividerCount += 1;
		}
	}

	return dividerCount + 1;
}
