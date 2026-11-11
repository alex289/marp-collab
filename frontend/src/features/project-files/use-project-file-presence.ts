import { useCallback } from "react";
import type { Awareness } from "y-protocols/awareness.js";
import { useAwarenessSnapshot } from "@/hooks/use-awareness-snapshot";
import { getProjectFilePresenceById, type ProjectFilePresenceById } from "./project-file-presence";

const noPresence: ProjectFilePresenceById = new Map();

export function useProjectFilePresence(
	awareness: Awareness | null,
	currentUserId: string | null,
): ProjectFilePresenceById {
	const selectPresence = useCallback(
		(states: Map<number, Record<string, unknown>>) =>
			getProjectFilePresenceById(states.values(), currentUserId),
		[currentUserId],
	);

	return useAwarenessSnapshot(awareness, selectPresence, noPresence);
}
