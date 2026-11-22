import { createAuthClient } from "better-auth/react";
import { lastLoginMethodClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
	basePath: "/api/v1/auth",
	plugins: [
		oauthProviderClient(),
		lastLoginMethodClient({ cookieName: "marp-collab.last_used_login_method" }),
	],
});

export const { signOut, useSession } = authClient;
