import { useSyncExternalStore } from "react";
import { isSlideTailwindReady, subscribeSlideTailwind } from "@/lib/marp";

/** True once the lazily loaded Tailwind compiler for slides is available. */
export function useSlideTailwindReady() {
	return useSyncExternalStore(subscribeSlideTailwind, isSlideTailwindReady);
}
