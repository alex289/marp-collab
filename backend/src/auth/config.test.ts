import { strictEqual } from "node:assert";
import { describe, test } from "node:test";
import { getAuthProviders, loadAuthConfig } from "./config.ts";

function clearAuthProviderEnv() {
	for (const key of Object.keys(process.env)) {
		if (key.startsWith("AUTH_PROVIDER_")) {
			delete process.env[key];
		}
	}
}

describe("auth provider config", () => {
	test("loads manual OAuth endpoint URLs from environment", () => {
		clearAuthProviderEnv();
		process.env.AUTH_PROVIDER_0_NAME = "Mock";
		process.env.AUTH_PROVIDER_0_CLIENT_ID = "client-id";
		process.env.AUTH_PROVIDER_0_CLIENT_SECRET = "client-secret";
		process.env.AUTH_PROVIDER_0_AUTHORIZATION_URL = "http://127.0.0.1:8091/authorize";
		process.env.AUTH_PROVIDER_0_TOKEN_URL = "http://host.docker.internal:8091/token";
		process.env.AUTH_PROVIDER_0_USER_INFO_URL = "http://host.docker.internal:8091/userinfo";

		try {
			loadAuthConfig();

			const [provider] = getAuthProviders();
			strictEqual(provider?.providerId, "0");
			strictEqual(provider?.authorizationUrl, "http://127.0.0.1:8091/authorize");
			strictEqual(provider?.tokenUrl, "http://host.docker.internal:8091/token");
			strictEqual(provider?.userInfoUrl, "http://host.docker.internal:8091/userinfo");
		} finally {
			clearAuthProviderEnv();
		}
	});
});
