import { useMemo, useSyncExternalStore } from "react";
import type { Awareness } from "y-protocols/awareness.js";

type AwarenessStates = ReturnType<Awareness["getStates"]>;

/**
 * Subscribes to awareness changes and returns `select(states)`. The selection is
 * recomputed only on awareness changes, so `select` and `fallback` must be stable.
 */
export function useAwarenessSnapshot<T>(
	awareness: Awareness | null,
	select: (states: AwarenessStates) => T,
	fallback: T,
): T {
	const store = useMemo(() => {
		if (!awareness) {
			return {
				subscribe: () => () => {
					/* nothing to subscribe to */
				},
				getSnapshot: () => fallback,
			};
		}

		let snapshot = select(awareness.getStates());
		return {
			subscribe: (onChange: () => void) => {
				const handleChange = () => {
					snapshot = select(awareness.getStates());
					onChange();
				};
				// Catch changes between render and subscription; React re-reads the snapshot afterwards.
				snapshot = select(awareness.getStates());
				awareness.on("change", handleChange);
				return () => awareness.off("change", handleChange);
			},
			getSnapshot: () => snapshot,
		};
	}, [awareness, select, fallback]);

	return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
