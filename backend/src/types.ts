import type { AuthSession } from "./auth.ts";

export type AppVariables = {
	user: AuthSession["user"] | null;
	session: AuthSession["session"] | null;
};
