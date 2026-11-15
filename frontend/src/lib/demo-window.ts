interface DocumentPictureInPicture {
	requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

declare global {
	interface Window {
		documentPictureInPicture?: DocumentPictureInPicture;
	}
}

export function supportsDemoWindow(): boolean {
	return typeof window.documentPictureInPicture?.requestWindow === "function";
}

/**
 * Opens an always-on-top Document Picture-in-Picture window for the demo
 * controls. Must be called from a user gesture. Returns null when the browser
 * doesn't support it (currently Chromium only) or the request is denied.
 *
 * The size can only be chosen here: resizing later needs a user gesture inside
 * the Picture-in-Picture window. `compact` leaves out room for speaker notes.
 */
export async function openDemoWindow({ compact }: { compact: boolean }): Promise<Window | null> {
	if (!supportsDemoWindow()) {
		return null;
	}

	try {
		const demoWindow = await window.documentPictureInPicture!.requestWindow({
			width: 360,
			height: compact ? 200 : 460,
		});
		demoWindow.document.title = "Live demo";
		copyDocumentStyles(demoWindow.document);
		return demoWindow;
	} catch {
		return null;
	}
}

function copyDocumentStyles(target: Document) {
	for (const sheet of document.styleSheets) {
		// Linked sheets keep their URL so relative font and asset URLs still resolve.
		if (sheet.href) {
			const link = target.createElement("link");
			link.rel = "stylesheet";
			link.href = sheet.href;
			target.head.append(link);
			continue;
		}

		try {
			const style = target.createElement("style");
			style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
			target.head.append(style);
		} catch {
			// Cross-origin sheets without an href can't be read; skip them.
		}
	}

	target.documentElement.className = document.documentElement.className;
	target.documentElement.style.colorScheme = document.documentElement.style.colorScheme;
}
