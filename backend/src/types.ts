import type { AuthSession } from "./auth.ts";

export type HonoVariables = {
	user: AuthSession["user"] | null;
	session: AuthSession["session"] | null;
};
