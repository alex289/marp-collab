import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "../auth.ts";
import type { HonoVariables } from "../types.ts";
import { verifyAssetToken } from "../helpers/asset-token.ts";

function getAssetTokenProjectId(c: Context<{ Variables: HonoVariables }>): string | undefined {
	if (c.req.method !== "GET") {
		return undefined;
	}

	if (!c.req.path.startsWith("/api/v1/projects/") || !c.req.path.includes("/files/")) {
		return undefined;
	}

	const token = c.req.query("token");
	if (!token) {
		return undefined;
	}

	const projectId = decodeURIComponent(c.req.path.split("/")[4] ?? "");

	return verifyAssetToken(token, projectId) ? projectId : undefined;
}

/**
 * Requires a session cookie on every /api/* route except the public ones and
 * the asset-token-eligible file-download route (see ASSET_TOKEN_ROUTE above).
 */
export const apiAuthMiddleware = createMiddleware<{ Variables: HonoVariables }>(async (c, next) => {
	if (
		c.req.path.startsWith("/api/v1/auth/") ||
		c.req.path.startsWith("/api/v1/health") ||
		c.req.path === "/api/v1/auth-providers"
	) {
		return next();
	}

	const assetTokenProjectId = getAssetTokenProjectId(c);
	if (assetTokenProjectId) {
		c.set("assetTokenProjectId", assetTokenProjectId);
		return next();
	}

	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	c.set("user", session.user);
	c.set("session", session.session);
	await next();
});
