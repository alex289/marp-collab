import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness.js";
import * as Y from "yjs";
import { API_URL } from "@/lib/config";
import type { PresenceUser, SessionUser } from "@/lib/types";

type CollabState = {
	yText: Y.Text | null;
	awareness: Awareness | null;
	undoManager: Y.UndoManager | null;
	status: "connecting" | "connected" | "disconnected" | "syncing";
	readOnly: boolean;
	synced: boolean;
	/**
	 * Name of the document this state belongs to. The state lags one render
	 * behind a document switch; consumers must compare this against the
	 * document they expect instead of assuming yText is the current file's.
	 */
	documentName: string | null;
};

const defaultState: CollabState = {
	yText: null,
	awareness: null,
	undoManager: null,
	status: "disconnected",
	readOnly: true,
	synced: false,
	documentName: null,
};

const palette = ["#f97316", "#16a34a", "#0ea5e9", "#e11d48", "#0891b2", "#ca8a04"];
const PROJECT_PRESENCE_DOCUMENT_ID = "__presence";
// Matches GIT_SYNC_REJECTION_REASON in backend/src/collab/hocuspocus.ts, sent while
// the project is syncing with Git, so we can surface it distinctly from a generic
// connection failure instead of leaving already-connected users guessing.
const GIT_SYNC_AUTH_FAILURE_REASON = "Project is syncing with Git";

const hashString = (value: string): number => {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash);
};

export const usePresenceUser = (sessionUser: SessionUser | null): PresenceUser => {
	const { id, email, name, image } = sessionUser ?? {};
	return useMemo(() => {
		if (!id) {
			return { userId: "", userName: "", color: "#0ea5e9", image: null };
		}
		const seed = id;
		return {
			userId: id,
			userName: name || email || "",
			color: palette[hashString(seed) % palette.length] ?? "#0ea5e9",
			image: image ?? null,
		};
	}, [id, email, name, image]);
};

export const useCollabDocument = (
	documentName: string | null,
	sessionUser: SessionUser | null,
	user: PresenceUser,
	reloadKey = 0,
	onStatelessMessage?: (payload: string) => void,
): CollabState => {
	const sessionUserId = sessionUser?.id;
	const [state, setState] = useState<CollabState>(defaultState);
	const handleStatelessMessage = useEffectEvent((payload: string) => {
		onStatelessMessage?.(payload);
	});

	useEffect(() => {
		// The cleanup of the previous document already reset the state.
		if (!documentName || !sessionUserId) {
			return;
		}

		const yDoc = new Y.Doc();
		const yText = yDoc.getText("content");
		const undoManager = new Y.UndoManager(yText);
		// Tracks whether the last authentication failure was caused by a Git sync
		// in progress, so a subsequent status change can be reported as "syncing"
		// instead of a plain disconnect until the provider reconnects.
		let gitSyncing = false;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		const retryDocument = () => {
			clearTimeout(retryTimer);
			retryTimer = setTimeout(() => {
				provider.detach();
				provider.attach();
			}, 1000);
		};

		const provider = new HocuspocusProvider({
			url: `${API_URL}/collab`,
			name: documentName,
			document: yDoc,
			onStatus: ({ status }) => {
				setState((current) => ({
					...current,
					status: gitSyncing && status !== "connected" ? "syncing" : status,
				}));
			},
			onClose: ({ event }) => {
				setState((current) => ({
					...current,
					status: gitSyncing ? "syncing" : "disconnected",
					synced: false,
					readOnly: true,
				}));
				if (event.code === 1000) {
					retryDocument();
				}
			},
			onAuthenticationFailed: ({ reason }) => {
				gitSyncing = reason === GIT_SYNC_AUTH_FAILURE_REASON;
				if (gitSyncing) {
					retryDocument();
					setState((current) => ({ ...current, status: "syncing", synced: false, readOnly: true }));
				}
			},
			onStateless: ({ payload }: { payload: string }) => {
				handleStatelessMessage(payload);
			},
			onSynced: () => {
				setState((current) => ({
					...current,
					status: "connected",
					synced: true,
				}));
			},
			onAuthenticated: ({ scope }) => {
				gitSyncing = false;
				clearTimeout(retryTimer);
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

		// Publishes the objects of the connection this effect just opened.
		// oxlint-disable-next-line react/set-state-in-effect
		setState({
			yText,
			awareness: provider.awareness,
			undoManager,
			status: "connecting",
			readOnly: true,
			synced: false,
			documentName,
		});

		return () => {
			clearTimeout(retryTimer);
			provider.destroy();
			yDoc.destroy();
			setState(defaultState);
		};
	}, [documentName, reloadKey, user, sessionUserId]);

	return state;
};

export const useProjectPresence = (
	projectId: string | null,
	sessionUser: SessionUser | null,
	user: PresenceUser,
	activeFileId: string | null,
	onStatelessMessage?: (payload: string) => void,
): Awareness | null => {
	const sessionUserId = sessionUser?.id;
	const [awareness, setAwareness] = useState<Awareness | null>(null);
	const providerRef = useRef<HocuspocusProvider | null>(null);
	const handleStatelessMessage = useEffectEvent((payload: string) => {
		onStatelessMessage?.(payload);
	});

	useEffect(() => {
		// The cleanup of the previous connection already reset the awareness.
		if (!projectId || !sessionUserId) {
			return;
		}

		const yDoc = new Y.Doc();
		const provider = new HocuspocusProvider({
			url: `${API_URL}/collab`,
			name: `project/${projectId}/${PROJECT_PRESENCE_DOCUMENT_ID}`,
			document: yDoc,
			onStateless: ({ payload }: { payload: string }) => {
				handleStatelessMessage(payload);
			},
		});

		providerRef.current = provider;
		// Publishes the awareness of the connection this effect just opened.
		// oxlint-disable-next-line react/set-state-in-effect
		setAwareness(provider.awareness);

		return () => {
			providerRef.current = null;
			provider.destroy();
			yDoc.destroy();
			setAwareness(null);
		};
	}, [projectId, sessionUserId]);

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
