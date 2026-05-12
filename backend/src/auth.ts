import { betterAuth } from "better-auth";
import { db } from "./db.ts";

export const auth = betterAuth({
	baseURL: process.env.URL,
	secret: process.env.AUTH_SECRET,
	basePath: "/api/v1/auth",
	database: db,
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 1 * 60, // Cache duration in seconds
		},
	},
	telemetry: {
		enabled: false,
	},
	rateLimit: {
		enabled: true,
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
});

export type AuthSession = typeof auth.$Infer.Session;
