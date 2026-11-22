import { css } from "@codemirror/lang-css";
import { autoCloseTags, html } from "@codemirror/lang-html";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { LanguageSupport } from "@codemirror/language";

// Use Marp's allowed tags and directive completions while keeping tag auto-close and CSS support.
const htmlTagLanguage = new LanguageSupport(html({ matchClosingTags: false }).language, [
	autoCloseTags,
	css().support,
]);

// Without YAML support, CommonMark can parse the front matter as a setext heading.
export function marpMarkdown() {
	return yamlFrontmatter({
		content: markdown({ base: markdownLanguage, completeHTMLTags: false, htmlTagLanguage }),
	});
}
