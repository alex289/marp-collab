export type SlidePresenterComments = {
	presenter: string | null;
	speakerNotes: string[];
};

export type PresenterUser = {
	name: string;
	image: string | null;
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

/** Finds the profile image of a known user whose name matches the presenter marker. */
export function findPresenterImage(
	presenter: string | null,
	users: readonly PresenterUser[],
): string | null {
	if (!presenter) {
		return null;
	}

	return (
		users.find(
			(user) =>
				user.image && user.name.localeCompare(presenter, undefined, { sensitivity: "base" }) === 0,
		)?.image ?? null
	);
}
