import type { ProjectTheme } from "./project-themes.ts";

export type ProjectThemeSnapshot = {
	themes: ProjectTheme[];
	names: string[];
	/** Bumped on every registration so renderers can re-render with the new CSS. */
	revision: number;
};

/** Update the global Marp registry alongside store state to avoid extra renders per keystroke. */
export function createProjectThemeStore(
	register: (themes: ProjectTheme[]) => string[],
	initialNames: string[],
) {
	let snapshot: ProjectThemeSnapshot = { themes: [], names: initialNames, revision: 0 };
	const listeners = new Set<() => void>();

	return {
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot: () => snapshot,
		update: (updater: (current: ProjectTheme[]) => ProjectTheme[]) => {
			const themes = updater(snapshot.themes);
			if (themes === snapshot.themes) {
				return;
			}

			snapshot = { themes, names: register(themes), revision: snapshot.revision + 1 };
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

export type ProjectThemeStore = ReturnType<typeof createProjectThemeStore>;
