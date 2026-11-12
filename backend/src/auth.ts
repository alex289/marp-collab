import { betterAuth } from "better-auth";
import { db } from "./db/db.ts";
import { genericOAuth, jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { MCP_SCOPES, mcpResource } from "./mcp/config.ts";
import { getAuthProviders } from "./auth/config.ts";

export const auth = betterAuth({
	baseURL: process.env.URL ?? "http://localhost:5173",
	secret: process.env.AUTH_SECRET,
	basePath: "/api/v1/auth",
	disabledPaths: ["/token"],
	database: db,
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 1 * 60, // Cache duration in seconds, reduces db load
		},
	},
	telemetry: {
		enabled: false,
	},
	rateLimit: {
		enabled: process.env.AUTH_RATE_LIMIT_ENABLED !== "false",
	},
	advanced: {
		database: {
			generateId: "uuid",
		},
		cookiePrefix: "marp-collab",
	},
	verification: {
		storeIdentifier: "hashed",
	},
	emailAndPassword: {
		enabled: false,
	},
	user: {
		additionalFields: {},
	},
	plugins: [
		jwt({ disableSettingJwtHeader: true }),
		mcp({
			loginPage: "/login",
			consentPage: "/consent",
			resource: mcpResource,
			scopes: MCP_SCOPES,
			grantTypes: ["authorization_code", "refresh_token"],
			refreshTokenReuseInterval: 0,
			allowDynamicClientRegistration: process.env.MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION === "true",
			allowUnauthenticatedClientRegistration:
				process.env.MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION === "true",
			clientRegistrationDefaultApplicationType: "infer",
			clientRegistrationDefaultScopes: MCP_SCOPES,
		}),
		cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
		genericOAuth({
			config: getAuthProviders(),
		}),
	],
});

export type AuthSession = typeof auth.$Infer.Session;
