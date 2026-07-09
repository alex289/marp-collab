import { useEffect, useMemo, useRef, useState } from "react";
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
	readOnly: boolean;
};

const defaultState: CollabState = {
	yText: null,
	awareness: null,
	undoManager: null,
	status: "disconnected",
	readOnly: false,
};

const palette = ["#f97316", "#16a34a", "#0ea5e9", "#e11d48", "#0891b2", "#ca8a04"];
const PROJECT_PRESENCE_DOCUMENT_ID = "__presence";

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
			return { userId: "", userName: "", color: "#0ea5e9", image: null };
		}
		const seed = sessionUser.id ?? sessionUser.email;
		return {
			userId: sessionUser.id,
			userName: sessionUser.name || sessionUser.email,
			color: palette[hashString(seed) % palette.length] ?? "#0ea5e9",
			image: sessionUser.image ?? null,
		};
	}, [sessionUser]);
};

export const useCollabDocument = (
	documentName: string | null,
	sessionUser: SessionUser | null,
	user: PresenceUser,
	onStatelessMessage?: (payload: string) => void,
): CollabState => {
	const [state, setState] = useState<CollabState>(defaultState);
	const onStatelessMessageRef = useRef(onStatelessMessage);
	onStatelessMessageRef.current = onStatelessMessage;

	useEffect(() => {
		if (!documentName || !sessionUser) {
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
			onStatus: ({ status }) => {
				setState((current) => ({
					...current,
					status,
				}));
			},
			onStateless: ({ payload }: { payload: string }) => {
				onStatelessMessageRef.current?.(payload);
			},
			onAuthenticated: ({ scope }) => {
				setState((current) => ({
					...current,
					readOnly: scope === "readonly",
				}));
			},
		});

		provider.setAwarenessField("user", {
			id: user.userId,
			name: user.userName,
			color: user.color,
			image: user.image,
		});

		setState({
			yText,
			awareness: provider.awareness,
			undoManager,
			status: "connecting",
			readOnly: false,
		});

		return () => {
			provider.destroy();
			yDoc.destroy();
			setState(defaultState);
		};
	}, [documentName, user, sessionUser]);

	return state;
};

export const useProjectPresence = (
	projectId: string | null,
	sessionUser: SessionUser | null,
	user: PresenceUser,
	activeFileId: string | null,
): Awareness | null => {
	const [awareness, setAwareness] = useState<Awareness | null>(null);
	const providerRef = useRef<HocuspocusProvider | null>(null);

	useEffect(() => {
		if (!projectId || !sessionUser) {
			setAwareness(null);
			return;
		}

		const yDoc = new Y.Doc();
		const provider = new HocuspocusProvider({
			url: `${API_URL}/collab`,
			name: `project/${projectId}/${PROJECT_PRESENCE_DOCUMENT_ID}`,
			document: yDoc,
		});

		providerRef.current = provider;
		setAwareness(provider.awareness);

		return () => {
			providerRef.current = null;
			provider.destroy();
			yDoc.destroy();
			setAwareness(null);
		};
	}, [projectId, sessionUser]);

	useEffect(() => {
		const provider = providerRef.current;
		if (!provider) {
			return;
		}

		provider.setAwarenessField("user", {
			id: user.userId,
			name: user.userName,
			color: user.color,
			image: user.image,
		});
	}, [awareness, user]);

	useEffect(() => {
		const provider = providerRef.current;
		if (!provider) {
			return;
		}

		provider.setAwarenessField(
			"activeFile",
			activeFileId
				? {
						fileId: activeFileId,
						updatedAt: Date.now(),
					}
				: null,
		);

		return () => {
			if (providerRef.current === provider) {
				provider.setAwarenessField("activeFile", null);
			}
		};
	}, [activeFileId, awareness]);

	return awareness;
};
