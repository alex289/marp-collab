import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, test } from "node:test";
import { loadAuthConfig, loadAuthIpAddressConfig } from "./config.ts";

describe("auth client IP config", () => {
	test("keeps Better Auth defaults when settings are blank", () => {
		deepStrictEqual(
			loadAuthIpAddressConfig({ AUTH_IP_ADDRESS_HEADER: " ", AUTH_TRUSTED_PROXIES: " , " }),
			{ ipAddressHeaders: undefined, trustedProxies: undefined },
		);
	});

	test("configures the proxy header and trusted hops from environment", () => {
		deepStrictEqual(
			loadAuthIpAddressConfig({
				AUTH_IP_ADDRESS_HEADER: " X-Real-IP ",
				AUTH_TRUSTED_PROXIES: "192.0.2.10, 2001:db8::/64, ",
			}),
			{ ipAddressHeaders: ["x-real-ip"], trustedProxies: ["192.0.2.10", "2001:db8::/64"] },
		);
	});
});

describe("auth provider config", () => {
	const providerCredentials = {
		AUTH_PROVIDER_0_NAME: "Mock",
		AUTH_PROVIDER_0_CLIENT_ID: "client-id",
		AUTH_PROVIDER_0_CLIENT_SECRET: "client-secret",
	};

	test("loads manual OAuth endpoint URLs from environment", () => {
		const {
			providers: [provider],
		} = loadAuthConfig({
			...providerCredentials,
			AUTH_PROVIDER_0_AUTHORIZATION_URL: "http://127.0.0.1:8091/authorize",
			AUTH_PROVIDER_0_TOKEN_URL: "http://host.docker.internal:8091/token",
			AUTH_PROVIDER_0_USER_INFO_URL: "http://host.docker.internal:8091/userinfo",
		});

		strictEqual(provider?.providerId, "0");
		strictEqual(provider?.authorizationUrl, "http://127.0.0.1:8091/authorize");
		strictEqual(provider?.tokenUrl, "http://host.docker.internal:8091/token");
		strictEqual(provider?.userInfoUrl, "http://host.docker.internal:8091/userinfo");
		strictEqual(provider?.name, "Mock");
	});

	test("uses id with sub fallback as account subject for manual OAuth endpoints", async () => {
		const {
			providers: [provider],
		} = loadAuthConfig({
			...providerCredentials,
			AUTH_PROVIDER_0_AUTHORIZATION_URL: "http://127.0.0.1:8091/authorize",
			AUTH_PROVIDER_0_TOKEN_URL: "http://host.docker.internal:8091/token",
		});

		const tokens = { accessToken: "token" };
		strictEqual(
			await provider?.accountSubject?.({
				tokens,
				profile: { id: "id-1", sub: "sub-1", emailVerified: true },
			}),
			"id-1",
		);
		strictEqual(
			await provider?.accountSubject?.({
				tokens,
				profile: { sub: "sub-1", emailVerified: true },
			}),
			"sub-1",
		);
	});

	test("keeps Better Auth's verified sub for discovery providers", () => {
		const {
			providers: [provider],
		} = loadAuthConfig({
			...providerCredentials,
			AUTH_PROVIDER_0_DISCOVERY_URL: "http://127.0.0.1:8091/.well-known/openid-configuration",
		});

		strictEqual(provider?.accountSubject, undefined);
	});

	test("exposes public names only for configured providers", () => {
		const { providers, publicProviderInfo } = loadAuthConfig({
			...providerCredentials,
			AUTH_PROVIDER_0_DISCOVERY_URL: "http://127.0.0.1:8091/.well-known/openid-configuration",
			AUTH_PROVIDER_1_NAME: "Incomplete",
			AUTH_PROVIDER_1_CLIENT_ID: "client-id",
		});

		deepStrictEqual(
			providers.map(({ providerId }) => providerId),
			["0"],
		);
		deepStrictEqual(publicProviderInfo, [{ id: "0", name: "Mock" }]);
	});
});
