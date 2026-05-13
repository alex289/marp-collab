import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	basePath: "/api/v1/auth",
	plugins: [genericOAuthClient()],
});

export const { signOut, useSession } = authClient;
