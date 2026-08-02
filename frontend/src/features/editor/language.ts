import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";

// Marp slides open with YAML frontmatter, which plain CommonMark parses as a setext
// heading (`marp: true` underlined by `---`), so the whole block came out styled as an
// H2. The GFM base additionally covers the tables and strikethrough that Marp renders.
export function marpMarkdown() {
	return yamlFrontmatter({
		content: markdown({ base: markdownLanguage, completeHTMLTags: false }),
	});
}
