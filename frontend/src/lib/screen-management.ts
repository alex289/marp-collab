interface ScreenDetailed {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
	readonly isPrimary: boolean;
}

interface ScreenDetails {
	readonly screens: ScreenDetailed[];
}

declare global {
	interface Window {
		getScreenDetails?: () => Promise<ScreenDetails>;
	}
}

export async function getSecondaryScreen(): Promise<ScreenDetailed | null> {
	if (typeof window.getScreenDetails !== "function") {
		return null;
	}

	try {
		const details = await window.getScreenDetails();
		return details.screens.find((s) => !s.isPrimary) ?? null;
	} catch {
		return null;
	}
}
