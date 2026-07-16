import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness.js";
import { getProjectFilePresenceById, type ProjectFilePresenceById } from "./project-file-presence";

export function useProjectFilePresence(
	awareness: Awareness | null,
	currentUserId: string | null,
): ProjectFilePresenceById {
	const [presence, setPresence] = useState<ProjectFilePresenceById>(new Map());

	useEffect(() => {
		if (!awareness) {
			setPresence(new Map());
			return;
		}

		const update = () =>
			setPresence(getProjectFilePresenceById(awareness.getStates().values(), currentUserId));
		update();
		awareness.on("change", update);

		return () => awareness.off("change", update);
	}, [awareness, currentUserId]);

	return presence;
}
