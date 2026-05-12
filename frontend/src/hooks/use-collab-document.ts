import { useEffect, useMemo, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness.js";
import * as Y from "yjs";
import { API_URL } from "@/lib/config";
import type { PresenceUser, SessionUser } from "@/lib/types";

type CollabState = {
	yText: Y.Text | null;
	awareness: Awareness | null;
	undoManager: Y.UndoManager | null;
	status: "connecting" | "connected" | "disconnected";
};

const defaultState: CollabState = {
	yText: null,
	awareness: null,
	undoManager: null,
	status: "disconnected",
};

const palette = ["#f97316", "#16a34a", "#0ea5e9", "#e11d48", "#0891b2", "#ca8a04"];

const hashString = (value: string): number => {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash);
};

export const usePresenceUser = (sessionUser: SessionUser | null): PresenceUser => {
	return useMemo(() => {
		if (!sessionUser) {
			const guestId = `guest-${crypto.randomUUID()}`;
			return {
				userId: guestId,
				userName: `Guest ${guestId.slice(-4)}`,
				color: palette[hashString(guestId) % palette.length] ?? "#0ea5e9",
			};
		}

		const seed = sessionUser.id ?? sessionUser.email;
		return {
			userId: sessionUser.id,
			userName: sessionUser.name || sessionUser.email,
			color: palette[hashString(seed) % palette.length] ?? "#0ea5e9",
		};
	}, [sessionUser]);
};

export const useCollabDocument = (documentName: string | null, user: PresenceUser): CollabState => {
	const [state, setState] = useState<CollabState>(defaultState);

	useEffect(() => {
		if (!documentName) {
			setState(defaultState);
			return;
		}

		const yDoc = new Y.Doc();
		const yText = yDoc.getText("content");
		const undoManager = new Y.UndoManager(yText);

		const provider = new HocuspocusProvider({
			url: `${API_URL}/collab`,
			name: documentName,
			document: yDoc,
			token: JSON.stringify(user),
			onStatus: ({ status }) => {
				setState((current) => ({
					...current,
					status,
				}));
			},
		});

		provider.setAwarenessField("user", {
			id: user.userId,
			name: user.userName,
			color: user.color,
		});

		setState({
			yText,
			awareness: provider.awareness,
			undoManager,
			status: "connecting",
		});

		return () => {
			provider.destroy();
			yDoc.destroy();
			setState(defaultState);
		};
	}, [documentName, user]);

	return state;
};
