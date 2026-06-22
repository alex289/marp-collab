import type * as Y from "yjs";

const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
const themeLineRegex = /^theme:\s*(.+?)\s*$/m;

/** Reads the `theme:` directive from a Marp markdown frontmatter, if present. */
export function getMarkdownTheme(markdown: string): string | null {
	const frontmatter = frontmatterRegex.exec(markdown);
	if (!frontmatter) {
		return null;
	}
	const line = themeLineRegex.exec(frontmatter[1]);
	return line ? line[1] : null;
}

/**
 * Sets (or replaces) the `theme:` directive inside the collaborative document.
 * Edits only the frontmatter block so concurrent body edits stay intact.
 */
export function applyThemeToYText(yText: Y.Text, theme: string): void {
	// oxlint-disable-next-line no-base-to-string
	const text = yText.toString();
	const frontmatter = frontmatterRegex.exec(text);

	yText.doc?.transact(() => {
		if (!frontmatter) {
			yText.insert(0, `---\nmarp: true\ntheme: ${theme}\n---\n\n`);
			return;
		}

		const lines = frontmatter[1].split(/\r?\n/);
		const themeIndex = lines.findIndex((line) => themeLineRegex.test(line));
		if (themeIndex === -1) {
			lines.push(`theme: ${theme}`);
		} else {
			lines[themeIndex] = `theme: ${theme}`;
		}

		const newBlock = `---\n${lines.join("\n")}\n---`;
		yText.delete(0, frontmatter[0].length);
		yText.insert(0, newBlock);
	});
}
