import { join } from "node:path";
import { test as setup } from "@playwright/test";

const authFile = join(import.meta.dirname, "../playwright/.auth/user.json");

setup("Authenticate", async ({ page }) => {
	// A single provider starts sign-in automatically.
	await page.goto("/login");

	await page.waitForURL("/");

	await page.context().storageState({ path: authFile });
});
