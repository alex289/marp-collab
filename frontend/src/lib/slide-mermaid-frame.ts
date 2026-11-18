import { MERMAID_RENDERER_PATH } from "../../../shared/slide-mermaid.ts";
import renderBlocksScript from "../../../shared/slide-mermaid-dom.js?raw";

// Runs in the existing sandboxed slide frames. Keep Mermaid's temporary SVG
// document in a separate frame so its resource policy can also block remote images.
export const slideMermaidFrameScript = String.raw`
${renderBlocksScript}
let mermaidRenderer;
const mermaidDiagrams = new Map();

function loadMermaidRenderer() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;border:0;visibility:hidden';
    const scriptUrl = new URL(${JSON.stringify(MERMAID_RENDERER_PATH)}, document.baseURI).href;
    frame.srcdoc = '<!doctype html><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src ' + scriptUrl +
      '; style-src \'unsafe-inline\'; img-src data:; font-src data:">' +
      '<scr' + 'ipt src="' + scriptUrl + '"></scr' + 'ipt>';
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      frame.remove();
      mermaidRenderer = undefined;
      reject(new Error('Mermaid renderer did not load'));
    }, 15000);
    channel.port1.onmessage = () => {
      clearTimeout(timeout);
      resolve(channel.port1);
    };
    frame.addEventListener('load', () => {
      frame.contentWindow?.postMessage('marp-mermaid-init', '*', [channel.port2]);
    }, { once: true });
    document.documentElement.appendChild(frame);
  });
}

async function renderMermaidDiagram(source) {
  mermaidRenderer ??= loadMermaidRenderer();
  const port = await mermaidRenderer;
  let diagram = mermaidDiagrams.get(source);
  if (!diagram) {
    diagram = new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => {
        channel.port1.close();
        resolve(data);
      };
      port.postMessage(source, [channel.port2]);
    });
    if (mermaidDiagrams.size >= 32) {
      mermaidDiagrams.delete(mermaidDiagrams.keys().next().value);
    }
    mermaidDiagrams.set(source, diagram);
  }
  return diagram;
}

function updateSlideMermaid() {
  void window.renderSlideMermaidBlocks(renderMermaidDiagram);
}
`;
