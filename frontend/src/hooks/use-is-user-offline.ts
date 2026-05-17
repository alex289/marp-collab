import { useState } from "react";

export default function useIsUserOffline() {
	const [isUserOffline, setIsUserOffline] = useState(!navigator.onLine);

	window.addEventListener("online", () => {
		setIsUserOffline(false);
	});

	window.addEventListener("offline", () => {
		setIsUserOffline(true);
	});

	return isUserOffline;
}
