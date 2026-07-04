import { test, expect } from "@playwright/test";

const PRESENTATION_NAME = "Hotkey Iframe Repro";

test("hotkeys keep working after clicking into the preview iframe", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("button", { name: "Create Presentation" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill(PRESENTATION_NAME);
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();

	await page
		.getByRole("link", { name: new RegExp(PRESENTATION_NAME) })
		.first()
		.click();
	await page.waitForURL(/\/presentations\/.+/);
	await expect(page.getByRole("button", { name: "presentation.md" })).toBeVisible({
		timeout: 10_000,
	});

	// Sanity check: hotkey works BEFORE touching the iframe.
	await page.keyboard.press("Alt+2");
	await expect(page.getByLabel("Find")).toBeVisible();
	await page.keyboard.press("Alt+1");
	await expect(page.getByLabel("Find")).not.toBeVisible();

	// Click into the preview iframe to move focus into its separate browsing context.
	const previewFrame = page.locator('iframe[title="Marp preview"]');
	await previewFrame.click();

	// The hotkey should still work after the iframe has focus.
	await page.keyboard.press("Alt+2");
	await expect(page.getByLabel("Find")).toBeVisible({ timeout: 3_000 });
});
