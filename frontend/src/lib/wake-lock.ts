let sentinel: WakeLockSentinel | null = null;
let active = false;

async function acquire() {
	if (!active || typeof navigator === "undefined" || !navigator.wakeLock) {
		return;
	}

	try {
		const lock = await navigator.wakeLock.request("screen");

		if (!active) {
			// Released again before the request resolved.
			void lock.release();
			return;
		}

		sentinel = lock;
		lock.addEventListener("release", () => {
			if (sentinel === lock) {
				sentinel = null;
			}
		});
	} catch {
		// Wake locks can be denied or unavailable, including while the tab is hidden.
	}
}

function handleVisibilityChange() {
	// The browser releases the lock whenever the tab is hidden, so it must be re-requested on return.
	if (active && !sentinel && document.visibilityState === "visible") {
		void acquire();
	}
}

/** Requests a screen wake lock, keeping the display on until {@link releaseWakeLock} is called. */
export async function requestWakeLock(): Promise<void> {
	if (active) {
		return;
	}

	active = true;
	document.addEventListener("visibilitychange", handleVisibilityChange);
	await acquire();
}

export async function releaseWakeLock(): Promise<void> {
	active = false;
	document.removeEventListener("visibilitychange", handleVisibilityChange);

	const lock = sentinel;
	sentinel = null;
	await lock?.release();
}
