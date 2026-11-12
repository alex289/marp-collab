import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
	basePath: "/api/v1/auth",
	plugins: [oauthProviderClient()],
});

export const { signOut, useSession } = authClient;
