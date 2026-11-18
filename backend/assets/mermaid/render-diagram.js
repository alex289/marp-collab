/* Appended to the pinned Mermaid distribution and run as a classic browser script. */
(() => {
	const mermaid = /** @type {typeof import("mermaid").default} */ (
		Reflect.get(globalThis, "mermaid")
	);
	const maxTextSize = 50_000;
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		htmlLabels: false,
		suppressErrorRendering: true,
		maxTextSize,
		// Mermaid's front matter and init directives cannot change site configuration.
		secure: Object.keys(mermaid.mermaidAPI.defaultConfig),
	});

	const stage = document.createElement("div");
	stage.setAttribute("aria-hidden", "true");
	stage.style.cssText = "position:absolute;left:0;top:0;width:1280px;visibility:hidden";
	let diagramId = 0;

	/** @param {string} source */
	async function renderDiagram(source) {
		if (!source.trim() || source.length > maxTextSize) {
			return null;
		}
		const container = stage.appendChild(document.createElement("div"));
		try {
			const { svg } = await mermaid.render(`marp-mermaid-${++diagramId}`, source, container);
			const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
			const image = parsed.documentElement;
			if (image.localName !== "svg") {
				return null;
			}
			// A standalone image keeps diagram IDs, styles and links out of the slide DOM.
			return {
				src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
				alt: image.querySelector("title")?.textContent?.trim() || "Mermaid diagram",
			};
		} catch {
			return null;
		} finally {
			container.remove();
		}
	}

	async function start() {
		document.body.append(stage);
		if (window.parent === window) {
			await renderSlideMermaidBlocks(renderDiagram);
			Reflect.set(window, "__marpMermaidReady", true);
			return;
		}
		// Browser views hand the sandboxed renderer a private port after the frame loads.
		window.addEventListener("message", (event) => {
			const [port] = event.ports;
			if (event.source !== window.parent || event.data !== "marp-mermaid-init" || !port) {
				return;
			}
			port.onmessage = async ({ data, ports: [reply] }) => {
				if (typeof data === "string" && reply) {
					reply.postMessage(await renderDiagram(data));
					reply.close();
				}
			};
			port.postMessage("ready");
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
	} else {
		void start();
	}
})();
