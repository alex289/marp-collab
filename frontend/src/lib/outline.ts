export type OutlineItem = {
	kind: "heading" | "slide";
	level: number;
	text: string;
	line: number;
};

// Tracks fenced code blocks so headings and slide separators inside code are ignored.
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

export function parseMarkdownOutline(markdown: string): OutlineItem[] {
	const outline: OutlineItem[] = [];
	const lines = markdown.split(/\r\n|\n|\r/);
	let fence: Fence | null = null;
	let slideNumber = 1;

	outline.push({
		kind: "slide",
		level: 1,
		text: "Slide 1",
		line: 1,
	});

	for (let index = 0; index < lines.length; index += 1) {
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

		if (/^\s*---\s*$/.test(line)) {
			slideNumber += 1;
			outline.push({
				kind: "slide",
				level: 1,
				text: `Slide ${slideNumber}`,
				line: index + 1,
			});
			continue;
		}

		// CommonMark allows ATX headings to be indented up to three spaces;
		// four leading spaces would make the line an indented code block.
		const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);

		if (!heading) {
			continue;
		}

		const text = heading[2].replace(/[ \t]+#+[ \t]*$/, "").trim();

		outline.push({
			kind: "heading",
			level: heading[1].length,
			text,
			line: index + 1,
		});
	}

	return outline;
}
