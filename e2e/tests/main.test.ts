import { test, expect } from "@playwright/test";

test("Dashboard", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByRole("heading", { name: "Presentations" })).toBeVisible();
	await expect(page.getByText("No presentations yet")).toBeVisible();

	// ...
});
