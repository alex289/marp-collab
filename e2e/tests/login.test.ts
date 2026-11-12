import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("automatically signs in with the only provider", async ({ page }) => {
	let signInRequests = 0;
	page.on("request", (request) => {
		if (request.url().endsWith("/auth/sign-in/social")) {
			signInRequests++;
		}
	});
	await page.goto("/login");
	await expect(page).toHaveURL("/");
	expect(signInRequests).toBe(1);
});

test("offers a choice when multiple providers are configured", async ({ page }) => {
	let signInRequests = 0;
	await page.route("**/auth-providers", (route) =>
		route.fulfill({
			json: {
				providers: [
					{ id: "0", name: "Mock" },
					{ id: "other", name: "Other" },
				],
			},
		}),
	);
	page.on("request", (request) => {
		if (request.url().endsWith("/auth/sign-in/social")) {
			signInRequests++;
		}
	});
	await page.goto("/login");
	await expect(page.getByRole("button", { name: "Sign in with Mock" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Sign in with Other" })).toBeVisible();
	expect(signInRequests).toBe(0);
	await page.getByRole("button", { name: "Sign in with Mock" }).click();
	await expect(page).toHaveURL("/");
});

test("allows retry after automatic sign-in fails", async ({ page }) => {
	let signInRequests = 0;
	await page.route("**/auth/sign-in/social", (route) => {
		signInRequests++;
		return route.fulfill({ status: 503, json: { message: "Provider unavailable" } });
	});
	await page.goto("/login");
	await expect(page.getByRole("alert")).toContainText("Unable to sign in.");
	const retry = page.getByRole("button", { name: "Sign in with Mock" });
	await expect(retry).toBeVisible();
	expect(signInRequests).toBe(1);
	await retry.click();
	await expect.poll(() => signInRequests).toBe(2);
	await expect(retry).toBeVisible();
});

test("does not automatically retry an OAuth callback error", async ({ page }) => {
	await page.goto("/login?error=access_denied");
	await expect(page.getByRole("alert")).toContainText("Unable to sign in.");
	await expect(page.getByRole("button", { name: "Sign in with Mock" })).toBeVisible();
	await expect(page).toHaveURL("/login?error=access_denied");
});

test("explains when no providers are configured", async ({ page }) => {
	await page.route("**/auth-providers", (route) => route.fulfill({ json: { providers: [] } }));
	await page.goto("/login");
	await expect(page.getByRole("alert")).toContainText("No authentication providers configured");
});

test("shows provider discovery failures", async ({ page }) => {
	await page.route("**/auth-providers", (route) =>
		route.fulfill({ status: 503, body: "Unavailable" }),
	);
	await page.goto("/login");
	await expect(page.getByRole("alert")).toContainText("Error loading authentication providers.");
});
