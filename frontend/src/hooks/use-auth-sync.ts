import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "@tanstack/react-router";

const CHANNEL_NAME = "marp-collab-auth";

/**
 * Syncs authentication state across browser tabs using BroadcastChannel.
 * When the user logs in or out in one tab, all other open tabs will
 * automatically reflect the new state.
 */
export function useAuthSync() {
	const router = useRouter();
	const { data: session } = useSession();
	const channelRef = useRef<BroadcastChannel | null>(null);
	const prevSessionRef = useRef<boolean | null>(null);

	useEffect(() => {
		const channel = new BroadcastChannel(CHANNEL_NAME);
		channelRef.current = channel;

		channel.addEventListener("message", async (event) => {
			const { type } = event.data;
			if (type === "login" || type === "logout") {
				await router.invalidate();
			}
		});

		return () => {
			channel.close();
			channelRef.current = null;
		};
	}, [router]);

	useEffect(() => {
		const hasSession = Boolean(session);

		if (prevSessionRef.current === null) {
			// First render — just record initial state, don't broadcast
			prevSessionRef.current = hasSession;
			return;
		}

		if (prevSessionRef.current !== hasSession) {
			prevSessionRef.current = hasSession;
			channelRef.current?.postMessage({ type: hasSession ? "login" : "logout" });
		}
	}, [session]);
}
