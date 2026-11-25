import type { GenericOAuthConfig } from "better-auth/plugins";
import { logger } from "../helpers/logger.ts";

let authConfig: ReturnType<typeof loadAuthConfig> | undefined;

const envBaseName = "AUTH_PROVIDER_";

function parseEnvName(envName: string) {
	const parts = envName.substring(envBaseName.length).split("_");
	const providerId = parts[0].toLowerCase();
	const configKey = parts.slice(1).join("_").toUpperCase();
	return { providerId, configKey };
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env) {
	const parsedProviders = new Map<string, Partial<GenericOAuthConfig>>();

	for (const key in env) {
		if (key.startsWith(envBaseName)) {
			const { providerId, configKey } = parseEnvName(key);
			const value = env[key]?.trim();

			if (!value) {
				continue;
			}

			if (!parsedProviders.has(providerId)) {
				parsedProviders.set(providerId, { providerId });
			}

			const providerConfig = parsedProviders.get(providerId)!;

			switch (configKey) {
				case "NAME":
					providerConfig.name = value;
					break;
				case "CLIENT_ID":
					providerConfig.clientId = value;
					break;
				case "CLIENT_SECRET":
					providerConfig.clientSecret = value;
					break;
				case "DISCOVERY_URL":
					providerConfig.discoveryUrl = value;
					break;
				case "AUTHORIZATION_URL":
					providerConfig.authorizationUrl = value;
					break;
				case "TOKEN_URL":
					providerConfig.tokenUrl = value;
					break;
				case "USER_INFO_URL":
					providerConfig.userInfoUrl = value;
					break;
				case "SCOPES":
					providerConfig.scopes = value.split(",").map((s) => s.trim());
					break;
				default:
					logger.warn(
						`Unknown config key ${configKey} for provider ${providerId}. Ignoring this environment variable.`,
					);
			}
		}
	}

	const providers: (GenericOAuthConfig & { name: string })[] = [];
	for (const [providerId, config] of parsedProviders.entries()) {
		const { clientId, clientSecret, name } = config;
		if (!clientId) {
			logger.error(
				`Missing CLIENT_ID environment variable for provider ${providerId}. Skipping this provider.`,
			);
			continue;
		}

		if (!clientSecret) {
			logger.error(
				`Missing CLIENT_SECRET environment variable for provider ${providerId}. Skipping this provider.`,
			);
			continue;
		}

		if (!config.discoveryUrl && (!config.authorizationUrl || !config.tokenUrl)) {
			logger.error(
				`Missing DISCOVERY_URL or AUTHORIZATION_URL/TOKEN_URL environment variables for provider ${providerId}. Skipping this provider.`,
			);
			continue;
		}

		if (!config.scopes) {
			config.scopes = ["openid", "email", "profile"];
		}

		if (!config.discoveryUrl) {
			config.accountSubject = ({ profile }) => profile.id || profile.sub || "";
		}

		if (!name) {
			logger.warn(
				`Missing NAME environment variable for provider ${providerId}. Skipping this provider.`,
			);
			continue;
		}

		providers.push({ ...config, providerId, clientId, clientSecret, name });
	}

	if (providers.length === 0) {
		logger.warn("No valid OAuth providers configured.");
	}

	return {
		providers,
		publicProviderInfo: providers.map(({ providerId, name }) => ({ id: providerId, name })),
	};
}

function getAuthConfig() {
	return (authConfig ??= loadAuthConfig());
}

export function getAuthProviders(): GenericOAuthConfig[] {
	return getAuthConfig().providers;
}

export function getPublicProviderInfo() {
	return getAuthConfig().publicProviderInfo;
}
