export type SlidePresenterComments = {
	presenter: string | null;
	speakerNotes: string[];
};

/**
 * A `presenter: Name` HTML comment identifies the slide's presenter.
 * All other comments remain available as speaker notes.
 */
export function parseSlidePresenterComments(comments: readonly string[]): SlidePresenterComments {
	let presenter: string | null = null;
	const speakerNotes: string[] = [];

	for (const rawComment of comments) {
		const comment = rawComment.trim();

		if (!comment) {
			continue;
		}

		const match = /^presenter\s*:\s*(.+)$/i.exec(comment);
		const presenterName = match?.[1]?.trim();

		if (presenterName) {
			presenter ??= presenterName;
			continue;
		}

		speakerNotes.push(comment);
	}

	return {
		presenter,
		speakerNotes,
	};
}

/** Returns the next presenter only when the following slide is a handoff. */
export function getNextPresenterChange(
	currentPresenter: string | null,
	nextPresenter: string | null,
): string | null {
	if (!currentPresenter || !nextPresenter) {
		return null;
	}

	return currentPresenter.localeCompare(nextPresenter, undefined, { sensitivity: "base" }) === 0
		? null
		: nextPresenter;
}
