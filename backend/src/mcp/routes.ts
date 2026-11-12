import { Hono } from "hono";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { createInsufficientScopeError } from "better-auth/oauth2";
import { auth } from "../auth.ts";
import { db } from "../db/db.ts";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE, MCP_SCOPES, mcpResource, mcpJwksUrl } from "./config.ts";
import { createPresentationServer } from "./server.ts";

export const mcpRouter = new Hono();

const handleMcp = requireMcpAuth(
	auth,
	async (request, claims) => {
		if (
			typeof claims.sub !== "string" ||
			!db.prepare("select id from user where id = ?").get(claims.sub)
		) {
			return Response.json({ error: "User not found" }, { status: 401 });
		}
		const scopes = new Set(typeof claims.scope === "string" ? claims.scope.split(" ") : []);
		// Challenge before entering the SDK, which turns tool exceptions into JSON-RPC errors.
		const body: unknown = await request
			.clone()
			.json()
			.catch(() => null);
		if (
			body &&
			typeof body === "object" &&
			"method" in body &&
			body.method === "tools/call" &&
			"params" in body &&
			body.params &&
			typeof body.params === "object" &&
			"name" in body.params &&
			(body.params.name === "create_presentation" || body.params.name === "edit_presentation") &&
			!scopes.has(MCP_WRITE_SCOPE)
		) {
			throw createInsufficientScopeError([MCP_WRITE_SCOPE]);
		}
		const userId = claims.sub;
		return createMcpHandler(() => createPresentationServer(userId, scopes)).fetch(request);
	},
	{
		resource: mcpResource,
		jwksUrl: mcpJwksUrl,
		requiredScopes: [MCP_READ_SCOPE],
		// New connections need editing tools by default; clients can still request read-only access.
		challengeScopes: [MCP_READ_SCOPE, MCP_WRITE_SCOPE],
	},
);

mcpRouter.post("/mcp", (c) => {
	// DPoP proofs target the public resource, including behind Vite or a reverse proxy.
	// Copy explicit fields: Hono's Node Request wrapper cannot be used as RequestInit.
	const init = {
		method: c.req.method,
		headers: c.req.raw.headers,
		body: c.req.raw.body,
		duplex: "half" as const,
		signal: c.req.raw.signal,
	};
	return handleMcp(new Request(mcpResource, init));
});
mcpRouter.all("/mcp", (c) => {
	c.header("Allow", "POST, OPTIONS");
	return c.body(null, 405);
});

// These discovery paths sit outside the normal auth base path and must be public.
mcpRouter.on(["GET", "OPTIONS"], "/.well-known/*", (c) => auth.handler(c.req.raw));

export async function getConsentDetails(request: Request) {
	const params = new URL(request.url).searchParams;
	const signed = new Set(["sig", "ba_param", ...params.getAll("ba_param")]);
	const query = new URLSearchParams([...params].filter(([key]) => signed.has(key))).toString();
	const { secret } = await auth.$context;
	if (!(await verifyOAuthQueryParams(query, secret))) {
		return null;
	}
	const verified = new URLSearchParams(query);
	const clientId = verified.get("client_id");
	const redirectUri = verified.get("redirect_uri");
	const scopes = verified.get("scope")?.split(" ").filter(Boolean) ?? [];
	if (!clientId || !redirectUri || scopes.some((scope) => !MCP_SCOPES.includes(scope))) {
		return null;
	}
	const client = await auth.api.getOAuthClientPublic({
		query: { client_id: clientId },
		headers: request.headers,
	});
	return {
		name: client.client_name ?? "AI client",
		redirectHost: new URL(redirectUri).host || new URL(redirectUri).protocol,
		scopes,
		oauthQuery: query,
	};
}

export const mcpConsentRouter = new Hono();
mcpConsentRouter.get("/consent", async (c) => {
	c.header("Cache-Control", "no-store");
	try {
		const details = await getConsentDetails(c.req.raw);
		return details
			? c.json(details)
			: c.json(
					{ error: "Invalid or expired authorization request. Reconnect from your AI client." },
					400,
				);
	} catch {
		return c.json(
			{ error: "Unable to load authorization request. Reconnect from your AI client." },
			400,
		);
	}
});
