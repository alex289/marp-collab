export type ProjectTheme = {
	id: string;
	css: string;
};

export function upsertProjectTheme(
	themes: ProjectTheme[],
	nextTheme: ProjectTheme,
): ProjectTheme[] {
	const existingIndex = themes.findIndex((theme) => theme.id === nextTheme.id);

	if (existingIndex === -1) {
		return [...themes, nextTheme];
	}

	if (themes[existingIndex]?.css === nextTheme.css) {
		return themes;
	}

	return themes.map((theme, index) => (index === existingIndex ? nextTheme : theme));
}
