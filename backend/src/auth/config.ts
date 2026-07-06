import type { GenericOAuthConfig } from "better-auth/plugins";
import { logger } from "../helpers/logger.ts";

const publicProviderInfo: { name: string; id: string }[] = [];
let providers: GenericOAuthConfig[] | undefined = undefined;

const envBaseName = "AUTH_PROVIDER_";

function parseEnvName(envName: string) {
	const parts = envName.substring(envBaseName.length).split("_");
	const providerId = parts[0].toLowerCase();
	const configKey = parts.slice(1).join("_").toUpperCase();
	return { providerId, configKey };
}

export function loadAuthConfig() {
	publicProviderInfo.length = 0;
	let parsedProviders = new Map<string, Partial<GenericOAuthConfig>>();

	for (const key in process.env) {
		if (key.startsWith(envBaseName)) {
			const { providerId, configKey } = parseEnvName(key);
			const value = process.env[key]?.trim();

			if (!value) {
				continue;
			}

			if (!parsedProviders.has(providerId)) {
				parsedProviders.set(providerId, { providerId });
			}

			const providerConfig = parsedProviders.get(providerId)!;

			switch (configKey) {
				case "NAME":
					publicProviderInfo.push({ name: value, id: providerId });
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

	// Validate and convert to final config array
	providers = [];
	for (const [providerId, config] of parsedProviders.entries()) {
		if (!config.clientId) {
			logger.error(
				`Missing CLIENT_ID environment variable for provider ${providerId}. Skipping this provider.`,
			);
			continue;
		}

		if (!config.clientSecret) {
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

		if (!publicProviderInfo.some((info) => info.id === providerId)) {
			logger.warn(
				`Missing NAME environment variable for provider ${providerId}. Skipping this provider.`,
			);
			continue;
		}

		providers.push(config as GenericOAuthConfig);
	}

	if (providers.length === 0) {
		logger.warn("No valid OAuth providers configured.");
	}
}

export function getAuthProviders(): GenericOAuthConfig[] {
	if (!providers) {
		loadAuthConfig();

		if (!providers) {
			throw new Error("No OAuth providers configured. Please set required environment variables.");
		}
	}
	return providers;
}

export function getPublicProviderInfo() {
	return publicProviderInfo;
}
