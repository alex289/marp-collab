/** Escapes a value for safe inclusion inside a double-quoted YAML scalar. Strips newlines to prevent breaking out of the frontmatter block. */
export function escapeYamlValue(value: string): string {
	return value
		.replace(/[\r\n]/g, " ")
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"');
}

/** Escapes and quotes a value for safe interpolation as a standalone YAML scalar. */
export function escapeYaml(value: string): string {
	return `"${escapeYamlValue(value)}"`;
}

/** Escapes a value for safe interpolation into HTML/Markdown text content. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
