import type { AuthSession } from "./auth.ts";

export type HonoVariables = {
	user: AuthSession["user"] | null;
	session: AuthSession["session"] | null;
	// Set instead of user/session when a request authenticates via a
	// short-lived asset token rather used in sandbox iframes
	assetTokenProjectId?: string;
};
