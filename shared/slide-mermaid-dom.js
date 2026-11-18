/**
 * Replaces each inert source block with its own diagram or error.
 * @param {(source: string) => Promise<{ src: string, alt: string } | null>} renderDiagram
 */
window.renderSlideMermaidBlocks = async (renderDiagram) => {
	const blocks = document.querySelectorAll('[data-marp-mermaid="pending"]');
	const slides = new Set(Array.from(blocks, (block) => block.parentElement));
	for (const slide of slides) {
		if (slide?.localName !== "section") {
			continue;
		}
		const { display, alignContent } = getComputedStyle(slide);
		if (display === "block") {
			// Let diagrams shrink around headings and other content. Keep the
			// theme's vertical alignment when switching from block to flex.
			slide.style.display = "flex";
			slide.style.flexFlow = "column nowrap";
			slide.style.justifyContent = alignContent;
		}
	}
	await Promise.all(
		Array.from(blocks, async (block) => {
			block.setAttribute("data-marp-mermaid", "rendering");
			const source = block.querySelector("template")?.content.textContent ?? "";
			try {
				const diagram = await renderDiagram(source);
				if (diagram && block.isConnected) {
					const image = new Image();
					image.alt = diagram.alt;
					image.src = diagram.src;
					await image.decode();
					block.replaceChildren(image);
					block.setAttribute("data-marp-mermaid", "ready");
					return;
				}
			} catch {
				// A failed renderer or image affects only this block.
			}
			if (block.isConnected) {
				block.textContent = "Mermaid diagram could not be rendered.";
				block.setAttribute("data-marp-mermaid", "error");
			}
		}),
	);
};
