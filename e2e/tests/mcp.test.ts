import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

const baseURL = "http://127.0.0.1:8090";
const redirectUri = `${baseURL}/mcp-test-callback`;

// The main suite signs out the shared setup session. Use a fresh session per test.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
	await page.goto("/login");
	await page.getByRole("button", { name: "Sign in with Mock" }).click();
	await expect(page).toHaveURL("/");
});

async function authorization(request: APIRequestContext) {
	const registration = await request.post("/api/v1/auth/oauth2/register", {
		headers: { origin: baseURL },
		data: {
			client_name: "Presentation assistant",
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"],
			response_types: ["code"],
			scope: "presentations:read presentations:write",
		},
	});
	expect(registration.status(), await registration.text()).toBe(201);
	const { client_id: clientId } = await registration.json();
	const verifier = randomBytes(32).toString("base64url");
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: "presentations:read presentations:write",
		resource: `${baseURL}/mcp`,
		code_challenge: createHash("sha256").update(verifier).digest("base64url"),
		code_challenge_method: "S256",
		state: "mcp-browser-test",
	});
	return { url: `${baseURL}/api/v1/auth/oauth2/authorize?${params}`, verifier, clientId };
}

test("authorizes an AI client through existing login and consent", async ({ page, context }) => {
	const flow = await authorization(page.request);
	await context.clearCookies();
	await page.route(`${redirectUri}*`, (route) => route.fulfill({ body: "Connected" }));
	await page.goto(flow.url);
	await expect(page).toHaveURL(/\/login\?/);
	await page.getByRole("button", { name: "Sign in with Mock" }).click();
	await expect(page.getByText("Connect to Marp Collab", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Presentation assistant is requesting access to your presentations."),
	).toBeVisible();
	await expect(
		page.getByText("Create and edit presentations in projects where you have write access."),
	).toBeVisible();
	await page.getByRole("button", { name: "Allow access" }).click();
	await page.waitForURL(`${redirectUri}*`);
	const callback = new URL(page.url());
	expect(callback.searchParams.get("error"), callback.href).toBeNull();
	expect(callback.searchParams.get("state")).toBe("mcp-browser-test");
	const token = await page.request.post("/api/v1/auth/oauth2/token", {
		headers: { origin: baseURL },
		form: {
			grant_type: "authorization_code",
			code: callback.searchParams.get("code")!,
			client_id: flow.clientId,
			redirect_uri: redirectUri,
			code_verifier: flow.verifier,
			resource: `${baseURL}/mcp`,
		},
	});
	expect(token.ok(), await token.text()).toBeTruthy();
	const { access_token: accessToken } = await token.json();
	const tools = await page.request.post("/mcp", {
		headers: {
			authorization: `Bearer ${accessToken}`,
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2025-11-25",
		},
		data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
	});
	expect(tools.ok(), `${tools.status()}: ${await tools.text()}`).toBeTruthy();
	expect(await tools.text()).toContain("create_presentation");
});

test("lets a signed-in user deny an AI connection", async ({ page }) => {
	const flow = await authorization(page.request);
	await page.route(`${redirectUri}*`, (route) => route.fulfill({ body: "Denied" }));
	await page.goto(flow.url);
	await expect(page.getByRole("button", { name: "Deny" })).toBeEnabled();
	await page.getByRole("button", { name: "Deny" }).click();
	await page.waitForURL(`${redirectUri}*`);
	expect(new URL(page.url()).searchParams.get("error")).toBe("access_denied");
});

test("blocks consent for unsigned authorization requests", async ({ page }) => {
	await page.goto("/consent?client_id=forged&scope=presentations:write");
	await expect(page.getByRole("alert")).toContainText("Invalid or expired request");
	await expect(page.getByRole("button", { name: "Allow access" })).toBeDisabled();
});
