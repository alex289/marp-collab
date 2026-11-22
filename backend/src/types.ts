import type { AuthSession } from "./auth.ts";

export type HonoVariables = {
	user: AuthSession["user"] | null;
	session: AuthSession["session"] | null;
	// Sandboxed iframes authenticate with a short-lived asset token instead of a session.
	assetTokenProjectId?: string;
};
