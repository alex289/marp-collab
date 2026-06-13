import { join } from "node:path";
import { test as setup } from "@playwright/test";

const authFile = join(import.meta.dirname, "../playwright/.auth/user.json");

setup("Authenticate", async ({ page }) => {
	await page.goto("/login");

	await page.click("button:has-text('Sign in with Mock')");

	await page.waitForURL("/");

	await page.context().storageState({ path: authFile });
});
