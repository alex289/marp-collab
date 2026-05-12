import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	basePath: "/api/v1/auth",
});

export const { signIn, signOut, signUp, useSession } = authClient;
