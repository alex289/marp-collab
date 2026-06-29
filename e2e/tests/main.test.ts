import { test, expect, type Page } from "@playwright/test";

const PRESENTATION_NAME = "E2E Test Presentation";
const MARKDOWN_FILE_NAME = "slides.md";
const CSS_FILE_NAME = "custom.css";
const FOLDER_NAME = "assets";

async function clickLastCard(page: Page, name: string) {
	await page
		.getByRole("link", { name: new RegExp(name) })
		.last()
		.click();
}

async function waitForSidebar(page: Page) {
	await expect(page.getByRole("button", { name: "presentation.md" })).toBeVisible({
		timeout: 10_000,
	});
}

async function fillPresentationName(page: Page, name: string) {
	await page.getByRole("textbox", { name: "Name" }).fill(name);
}

async function fillNewFileName(page: Page, fileName: string) {
	await page.getByRole("textbox", { name: "File name" }).fill(fileName);
}

async function clickSidebarDelete(
	page: Page,
	itemName: string,
	kind: "Delete file" | "Delete folder",
) {
	const menuItem = page.locator('[data-sidebar="menu-item"]').filter({
		has: page.getByRole("button", { name: itemName }),
	});
	// Hover the item button directly so both group-hover and peer-hover CSS fire
	await menuItem.getByRole("button", { name: itemName }).hover();
	// CSS [title=] exact match is more reliable than getByTitle (partial match)
	await menuItem.locator(`[title="${kind}"]`).click();
}

test.describe("Dashboard", () => {
	test("shows empty state on a fresh account", async ({ page }) => {
		await page.goto("/");

		await expect(page.getByRole("heading", { name: "Presentations" })).toBeVisible();
		await expect(page.getByText("No presentations yet")).toBeVisible();
		await expect(page.getByRole("button", { name: "Create Presentation" })).toBeVisible();
	});
});

test.describe("Presentation lifecycle", () => {
	test("create a presentation and open it", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Create Presentation" })).toBeVisible();

		await fillPresentationName(page, PRESENTATION_NAME);
		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(
			page.getByRole("link", { name: new RegExp(PRESENTATION_NAME) }).last(),
		).toBeVisible();

		await clickLastCard(page, PRESENTATION_NAME);
		await expect(page).toHaveURL(/\/presentations\/.+/);

		await waitForSidebar(page);
	});

	test("create dialog validates required name", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();

		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByRole("dialog")).toBeVisible();
	});

	test("cancel create dialog discards input", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Draft");
		await page.getByRole("button", { name: "Cancel" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText("Draft")).not.toBeVisible();
	});
});

test.describe("Editor page — file management", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, PRESENTATION_NAME);
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await clickLastCard(page, PRESENTATION_NAME);
		await page.waitForURL(/\/presentations\/.+/);

		await waitForSidebar(page);
	});

	test("editor layout is visible with sidebar and panes", async ({ page }) => {
		await expect(page.getByRole("button", { name: "presentation.md" })).toBeVisible();
		await expect(
			page.locator('[data-slot="card-title"]').filter({ hasText: "Editor" }),
		).toBeVisible();
		await expect(page.getByText("Live Preview")).toBeVisible();
	});

	test("auto-selects presentation.md and shows it in the editor", async ({ page }) => {
		await expect(page.getByText("Active file: presentation.md")).toBeVisible();
	});

	test("create a markdown file and select it", async ({ page }) => {
		await page.getByRole("button", { name: "New file" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByRole("heading", { name: "New File" })).toBeVisible();

		await fillNewFileName(page, MARKDOWN_FILE_NAME);
		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText(MARKDOWN_FILE_NAME)).toBeVisible();

		await page.getByText(MARKDOWN_FILE_NAME).click();
		await expect(page.getByText(`Active file: ${MARKDOWN_FILE_NAME}`)).toBeVisible();
	});

	test("create a CSS file", async ({ page }) => {
		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, CSS_FILE_NAME);
		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText(CSS_FILE_NAME)).toBeVisible();
	});

	test("create a folder", async ({ page }) => {
		await page.getByRole("button", { name: "New folder" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByRole("heading", { name: "New Folder" })).toBeVisible();

		await page.getByLabel("Folder name").fill(FOLDER_NAME);
		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText(FOLDER_NAME)).toBeVisible();
	});

	test("create a file inside a folder using slash syntax", async ({ page }) => {
		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, `${FOLDER_NAME}/notes.md`);
		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await page.getByText(FOLDER_NAME).click();
		await expect(page.getByText("notes.md")).toBeVisible();
	});

	test("delete a file", async ({ page }) => {
		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, "to-delete.md");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText("to-delete.md")).toBeVisible();

		await clickSidebarDelete(page, "to-delete.md", "Delete file");

		await expect(page.getByRole("dialog")).toBeVisible();
		await page.getByRole("button", { name: "Delete" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText("to-delete.md")).not.toBeVisible();
	});

	test("delete a folder", async ({ page }) => {
		await page.getByRole("button", { name: "New folder" }).click();
		await page.getByLabel("Folder name").fill("temp-folder");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText("temp-folder")).toBeVisible();

		await clickSidebarDelete(page, "temp-folder", "Delete folder");

		await expect(page.getByRole("dialog")).toBeVisible();
		await page.getByRole("button", { name: "Delete" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText("temp-folder")).not.toBeVisible();
	});

	test("cancel file deletion keeps the file", async ({ page }) => {
		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, "keep-me.md");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await clickSidebarDelete(page, "keep-me.md", "Delete file");

		await expect(page.getByRole("dialog")).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText("keep-me.md")).toBeVisible();
	});
});

test.describe("Editor: content editing", () => {
	test("type into the CodeMirror editor and see live preview update", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Editor Flow Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Editor Flow Test");
		await page.waitForURL(/\/presentations\/.+/);

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });

		await editor.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.type("# Hello World");

		const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
		await expect(previewFrame.getByRole("heading", { name: "Hello World" })).toBeVisible({
			timeout: 10_000,
		});
	});
});

test.describe("Presentation mode", () => {
	test("start and end a presentation", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Presentation Mode Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Presentation Mode Test");
		await page.waitForURL(/\/presentations\/.+/);

		await waitForSidebar(page);

		await page.getByRole("button", { name: "Start presentation" }).click();
		await expect(page).toHaveURL(/mode=present/);

		await expect(page.getByRole("button", { name: "End presentation" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Previous" })).toBeVisible();

		await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 15_000 });
		await page.getByRole("button", { name: "Next" }).click();
		await expect(page.getByText(/Slide 2/)).toBeVisible();

		await page.getByRole("button", { name: "Previous" }).click();
		await expect(page.getByText(/Slide 1/)).toBeVisible();

		await page.getByRole("button", { name: "End presentation" }).click();
		await expect(page).not.toHaveURL(/mode=present/);
		await expect(
			page.locator('[data-slot="card-title"]').filter({ hasText: "Editor" }),
		).toBeVisible();
	});

	test("Escape key exits presentation mode", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Escape Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Escape Test");
		await page.waitForURL(/\/presentations\/.+/);

		await expect(page.getByRole("button", { name: "Start presentation" })).toBeVisible({
			timeout: 10_000,
		});

		await page.getByRole("button", { name: "Start presentation" }).click();
		await expect(page).toHaveURL(/mode=present/);
		await expect(page.getByRole("button", { name: "End presentation" })).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page).not.toHaveURL(/mode=present/);
	});
});

test.describe("Navigation", () => {
	test("logo link navigates back to dashboard", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Nav Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Nav Test");
		await page.waitForURL(/\/presentations\/.+/);

		await page.getByRole("link", { name: "Marp Collab" }).click();
		await expect(page).toHaveURL("/");
		await expect(page.getByRole("heading", { name: "Presentations" })).toBeVisible();
		await expect(page.getByRole("link", { name: /Nav Test/ })).toBeVisible();
	});

	test("logout redirects to login page", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Logout" }).click();
		await expect(page).toHaveURL("/login");
	});
});
