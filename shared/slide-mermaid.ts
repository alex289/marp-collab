export const MERMAID_RENDERER_PATH = "/api/v1/mermaid-renderer.js";

const diagramStart = '<div class="marp-mermaid" data-marp-mermaid="pending"><template>';

type FenceToken = { info: string; content: string };
type FenceRule = (tokens: FenceToken[], index: number, ...args: unknown[]) => string;

export function mermaidFences(md: { renderer: { rules: { fence: FenceRule } } }) {
	const originalFence = md.renderer.rules.fence;
	md.renderer.rules.fence = (tokens, index, ...args) => {
		const token = tokens[index]!;
		if (token.info.trim().split(/\s+/, 1)[0]?.toLowerCase() !== "mermaid") {
			return originalFence(tokens, index, ...args);
		}
		const source = token.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
		return `${diagramStart}${source}</template></div>\n`;
	};
}

export function hasMermaidDiagrams(html: string): boolean {
	return html.includes(diagramStart);
}

export const MERMAID_SLIDE_CSS = `
section .marp-mermaid {
	display: grid;
	grid-template: minmax(0, 1fr) / minmax(0, 1fr);
	place-items: center;
	min-width: 0;
	min-height: 0;
	max-height: 100%;
}
section .marp-mermaid img {
	width: 100%;
	height: 100%;
	object-fit: contain;
}
section .marp-mermaid[data-marp-mermaid="error"] {
	display: block;
	flex-shrink: 0;
	border: 1px solid currentColor;
	border-radius: 0.25em;
	padding: 0.35em 0.65em;
	font-size: 0.65em;
}
`;
