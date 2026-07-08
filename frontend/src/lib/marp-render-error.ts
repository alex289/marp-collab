const unknownRenderError = "Unbekannter Fehler";

export type MarpRenderErrorFallback = {
	html: string;
	css: string;
	comments: string[][];
	errorMessage: string;
};

export function getMarpRenderErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === "string" && error.trim()) {
		return error;
	}

	return unknownRenderError;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return char;
		}
	});
}

export function createMarpRenderErrorFallback(error: unknown): MarpRenderErrorFallback {
	const errorMessage = getMarpRenderErrorMessage(error);

	return {
		html: `<section><h1>Marp Render Fehler</h1><p>${escapeHtml(errorMessage)}</p></section>`,
		css: "",
		comments: [[]],
		errorMessage,
	};
}
