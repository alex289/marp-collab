import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

async function readMermaidRenderer() {
	const deployed = new URL("../assets/mermaid/", import.meta.url);
	const library = new URL("mermaid.min.js", deployed);
	const isDeployed = existsSync(library);
	const [mermaid, license, dom, renderer] = await Promise.all([
		readFile(
			isDeployed ? library : new URL(import.meta.resolve("mermaid/dist/mermaid.min.js")),
			"utf8",
		),
		readFile(
			isDeployed ? new URL("LICENSE", deployed) : new URL(import.meta.resolve("mermaid/LICENSE")),
			"utf8",
		),
		readFile(
			isDeployed
				? new URL("slide-mermaid-dom.js", deployed)
				: new URL("../../../shared/slide-mermaid-dom.js", import.meta.url),
			"utf8",
		),
		readFile(
			isDeployed
				? new URL("render-diagram.js", deployed)
				: new URL("../../assets/mermaid/render-diagram.js", import.meta.url),
			"utf8",
		),
	]);
	// Normalize line endings as the HTML parser does, and keep script tags in the
	// trusted bundle from affecting the HTML parser when inlined for PDF export.
	const script = `/*\n${license}\n*/\n${mermaid}\n;${dom}\n;${renderer}`
		.replace(/\r\n?/g, "\n")
		.replace(/<\/?script/gi, (tag) => `\\x3c${tag.slice(1)}`);
	const hash = createHash("sha256").update(script).digest("base64");
	return { script, hash };
}

let renderer: Promise<Awaited<ReturnType<typeof readMermaidRenderer>>> | undefined;

export const getMermaidRenderer = () => (renderer ??= readMermaidRenderer());
