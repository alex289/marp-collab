import { test as setup } from "@playwright/test";
import { AUTH_STATE_PATH } from "../test-environment.ts";

setup("Authenticate", async ({ page }) => {
	// A single provider starts sign-in automatically.
	await page.goto("/login");

	await page.waitForURL("/");

	await page.context().storageState({ path: AUTH_STATE_PATH });
});
