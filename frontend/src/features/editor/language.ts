import { css } from "@codemirror/lang-css";
import { autoCloseTags, html } from "@codemirror/lang-html";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { LanguageSupport } from "@codemirror/language";

// Inline HTML keeps auto-closing tags and CSS support in <style>, but not the HTML
// language's own tag completions: inside HTML comments they would bury the Marp and
// MarpCollab comment completions, and outside them our Marp-allowed tag list applies.
const htmlTagLanguage = new LanguageSupport(html({ matchClosingTags: false }).language, [
	autoCloseTags,
	css().support,
]);

// Marp slides open with YAML frontmatter, which plain CommonMark parses as a setext
// heading (`marp: true` underlined by `---`), so the whole block came out styled as an
// H2. The GFM base additionally covers the tables and strikethrough that Marp renders.
export function marpMarkdown() {
	return yamlFrontmatter({
		content: markdown({ base: markdownLanguage, completeHTMLTags: false, htmlTagLanguage }),
	});
}
