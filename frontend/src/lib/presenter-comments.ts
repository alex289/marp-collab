export type SlidePresenterComments = {
	presenter: string | null;
	/** `null` when the slide has no demo marker, otherwise the (possibly empty) demo title. */
	demo: string | null;
	speakerNotes: string[];
};

export type PresenterUser = {
	name: string;
	image: string | null;
};

/**
 * A `presenter: Name` HTML comment identifies the slide's presenter and a
 * `demo` or `demo: Title` comment marks the slide as a live demo. The demo
 * title is shown to the audience, so only the marker's first line is used;
 * further lines stay private speaker notes. A single-line `section: Name`
 * comment leading the slide labels a group of slides in the slide overview
 * and is not a note.
 * All other comments remain available as speaker notes.
 */
export function parseSlidePresenterComments(comments: readonly string[]): SlidePresenterComments {
	let presenter: string | null = null;
	let demo: string | null = null;
	const speakerNotes: string[] = [];

	for (const [index, rawComment] of comments.entries()) {
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

		if (index === 0 && /^section[ \t]*:[^\r\n]*$/i.test(comment)) {
			continue;
		}

		const demoMatch = /^demo(?:[ \t]*:([^\n]*))?(?:\n([\s\S]*))?$/i.exec(comment);
		if (demoMatch && demo === null) {
			demo = demoMatch[1]?.trim() ?? "";
			const notes = demoMatch[2]?.trim();
			if (notes) {
				speakerNotes.push(notes);
			}
			continue;
		}

		speakerNotes.push(comment);
	}

	return {
		presenter,
		demo,
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
