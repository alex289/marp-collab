type AudienceViewer = {
	deck: string;
	window: Window;
	show: (stream: MediaStream | null) => void;
};

type DemoShare = {
	deck: string;
	stream: MediaStream;
	end: () => void;
};

type DemoAudience = {
	viewers: Set<AudienceViewer>;
	share: DemoShare | null;
	presenter?: { deck: string; stopDemo: () => void };
};

export const TOGGLE_AUDIENCE_FULLSCREEN = "marp-collab:toggle-audience-fullscreen";

const demoAudienceKey = Symbol.for("marp-collab.demo-audience");
type DemoAudienceWindow = Window & { [demoAudienceKey]?: DemoAudience };

// Keep local audience controls and video on the opener. Awareness only
// carries the demo flag for viewers on other devices.
function getDemoAudience(host: Window): DemoAudience {
	return ((host as DemoAudienceWindow)[demoAudienceKey] ??= { viewers: new Set(), share: null });
}

function getOpenerAudience() {
	const opener = window.opener as Window | null;
	try {
		if (!opener || opener.closed || opener.location.origin !== window.location.origin) {
			return;
		}
		return getDemoAudience(opener);
	} catch {
		// Viewers opened from a different origin have no local presenter connection.
		return;
	}
}

function openAudienceChannel(deck: string) {
	return typeof BroadcastChannel === "function"
		? new BroadcastChannel(`marp-collab.demo-audience:${deck}`)
		: null;
}

export function connectDemoAudience(deck: string, show: AudienceViewer["show"]) {
	let audience: DemoAudience | undefined;
	let active = true;
	if (!window.opener) {
		return;
	}

	const viewer = { deck, window, show };
	const disconnect = () => {
		const previous = audience;
		audience = undefined;
		previous?.viewers.delete(viewer);
		if (previous?.share?.deck === deck && !hasDemoAudience(deck, previous)) {
			previous.share.end();
		}
	};
	const connect = () => {
		if (!active) {
			return;
		}
		const openerAudience = getOpenerAudience();
		if (audience === openerAudience) {
			return;
		}
		disconnect();
		audience = openerAudience;
		audience?.viewers.add(viewer);
		show(audience?.share?.deck === deck ? audience.share.stream : null);
	};
	const hide = () => {
		active = false;
		disconnect();
	};
	const showPage = () => {
		active = true;
		connect();
	};
	// A presenter reload replaces the opener's registry without reloading its audience windows.
	const channel = openAudienceChannel(deck);
	channel?.addEventListener("message", connect);
	connect();
	window.addEventListener("pagehide", hide);
	window.addEventListener("pageshow", showPage);
	return () => {
		channel?.close();
		window.removeEventListener("pagehide", hide);
		window.removeEventListener("pageshow", showPage);
		hide();
	};
}

export function registerDemoPresenter(deck: string, stopDemo: () => void) {
	const audience = getDemoAudience(window);
	const presenter = { deck, stopDemo };
	audience.presenter = presenter;
	const channel = openAudienceChannel(deck);
	channel?.postMessage("presenter-ready");
	return () => {
		channel?.close();
		if (audience.presenter === presenter) {
			audience.presenter = undefined;
		}
	};
}

export function stopDemoFromAudience(deck: string) {
	const presenter = getOpenerAudience()?.presenter;
	if (presenter?.deck === deck) {
		presenter.stopDemo();
	}
}

export function toggleAudienceFullscreen(deck: string): boolean {
	const viewer = Array.from(getDemoAudience(window).viewers)
		.reverse()
		.find((viewer) => viewer.deck === deck && !viewer.window.closed);
	if (!viewer) {
		return false;
	}

	const targetOrigin = window.location.origin;
	const options = { targetOrigin, delegate: "fullscreen" };
	try {
		viewer.window.postMessage(TOGGLE_AUDIENCE_FULLSCREEN, options);
	} catch {
		// A viewer can still exit fullscreen or show its own fullscreen prompt.
		viewer.window.postMessage(TOGGLE_AUDIENCE_FULLSCREEN, targetOrigin);
	}
	return true;
}

export function hasDemoAudience(deck: string, audience = getDemoAudience(window)): boolean {
	return Array.from(audience.viewers).some(
		(viewer) => viewer.deck === deck && !viewer.window.closed,
	);
}

export function stopDemoStream(stream: MediaStream) {
	for (const track of stream.getTracks()) {
		track.stop();
	}
}

export function publishDemoShare(deck: string, stream: MediaStream, end: () => void) {
	const audience = getDemoAudience(window);
	const [videoTrack] = stream.getVideoTracks();
	if (videoTrack?.readyState !== "live" || !hasDemoAudience(deck, audience)) {
		stopDemoStream(stream);
		return null;
	}

	const share = { deck, stream, end };
	audience.share = share;
	videoTrack.addEventListener("ended", end, { once: true });
	for (const viewer of audience.viewers) {
		if (viewer.deck === deck) {
			viewer.show(stream);
		}
	}

	return () => {
		videoTrack.removeEventListener("ended", end);
		stopDemoStream(stream);
		if (audience.share !== share) {
			return;
		}
		audience.share = null;
		for (const viewer of audience.viewers) {
			if (viewer.deck === deck) {
				viewer.show(null);
			}
		}
	};
}
