import { test, expect, type Page } from "@playwright/test";

const PRESENTATION_NAME = "E2E Test Presentation";
const MARKDOWN_FILE_NAME = "slides.md";
const CSS_FILE_NAME = "custom.css";
const FOLDER_NAME = "assets";

async function clickLastCard(page: Page, name: string) {
	await page
		.getByRole("link", { name: new RegExp(name) })
		.first()
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
	test("applies a custom theme after opening before theme CSS finishes loading", async ({
		page,
	}) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Delayed Theme Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Delayed Theme Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		await page.getByTitle("Upload file").click();
		await page.locator('input[type="file"]').setInputFiles({
			name: "race-theme.css",
			mimeType: "text/css",
			buffer: Buffer.from(
				"/* @theme race-theme */\nsection { background: rgb(1, 2, 3); color: rgb(250, 251, 252); }",
			),
		});
		await page.getByRole("button", { name: "Upload", exact: true }).click();
		await expect(page.getByRole("button", { name: "race-theme.css" })).toBeVisible({
			timeout: 5_000,
		});

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.type("---\nmarp: true\ntheme: race-theme\n---\n\n# Race Theme");
		const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
		await expect(previewFrame.getByRole("heading", { name: "Race Theme" })).toBeVisible({
			timeout: 10_000,
		});

		const presentationUrl = page.url();
		let releaseCss!: () => void;
		const cssBlocked = new Promise<void>((resolve) => {
			releaseCss = resolve;
		});
		await page.route(/\/api\/v1\/projects\/[^/]+\/files\/race-theme\.css$/, async (route) => {
			await cssBlocked;
			await route.continue();
		});

		await page.goto(`${presentationUrl}?mode=present`);
		const presentationFrame = page.frameLocator('iframe[title="Presentation"]');
		await expect(presentationFrame.getByRole("heading", { name: "Marp Render Error" })).toBeVisible(
			{ timeout: 10_000 },
		);

		releaseCss();

		await expect
			.poll(() =>
				presentationFrame
					.locator("section")
					.first()
					.evaluate((section) => window.getComputedStyle(section).backgroundColor),
			)
			.toBe("rgb(1, 2, 3)");
	});

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

test.describe("Dashboard: card actions", () => {
	test("rename a presentation from the card", async ({ page }) => {
		const ORIGINAL = "Card Rename Original";
		const RENAMED = "Card Rename Updated";
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, ORIGINAL);
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await page.getByRole("button", { name: `Rename ${ORIGINAL}` }).click();
		await expect(page.getByRole("heading", { name: "Rename Presentation" })).toBeVisible();

		await page.getByRole("dialog").getByLabel("Name").fill(RENAMED);
		await page.getByRole("button", { name: "Rename" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("link", { name: new RegExp(RENAMED) })).toBeVisible();
	});

	test("rename submit button is disabled when name is unchanged", async ({ page }) => {
		const NAME = "Rename Unchanged Test";
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, NAME);
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await page.getByRole("button", { name: `Rename ${NAME}` }).click();
		await expect(page.getByRole("heading", { name: "Rename Presentation" })).toBeVisible();

		await expect(page.getByRole("button", { name: "Rename" })).toBeDisabled();
	});

	test("cancel rename keeps the original name", async ({ page }) => {
		const NAME = "Cancel Rename Test";
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, NAME);
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await page.getByRole("button", { name: `Rename ${NAME}` }).click();
		await expect(page.getByRole("heading", { name: "Rename Presentation" })).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("link", { name: new RegExp(NAME) })).toBeVisible();
	});

	test("delete a presentation from the card", async ({ page }) => {
		const NAME = "Card Delete Test";
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, NAME);
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("link", { name: new RegExp(NAME) })).toBeVisible();

		await page.getByRole("button", { name: `Delete ${NAME}` }).click();
		await expect(page.getByRole("heading", { name: "Delete Presentation" })).toBeVisible();
		await page.getByRole("button", { name: "Delete" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("link", { name: new RegExp(NAME) })).not.toBeVisible();
	});

	test("cancel delete keeps the presentation", async ({ page }) => {
		const NAME = "Cancel Delete Test";
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, NAME);
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await page.getByRole("button", { name: `Delete ${NAME}` }).click();
		await expect(page.getByRole("heading", { name: "Delete Presentation" })).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("link", { name: new RegExp(NAME) })).toBeVisible();
	});
});

test.describe("Editor: settings panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Settings Panel Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Settings Panel Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);
		await page
			.getByRole("button", { name: /^Settings/ })
			.first()
			.click();
		await expect(page.getByLabel("Project name")).toBeVisible({ timeout: 5_000 });
	});

	test("settings panel shows the current project name", async ({ page }) => {
		await expect(page.getByLabel("Project name")).toHaveValue("Settings Panel Test");
	});

	test("rename project from settings panel saves the new name", async ({ page }) => {
		const input = page.getByLabel("Project name");
		await input.fill("Settings Panel Renamed");
		await page.getByRole("button", { name: "Save" }).click();
		await expect(input).toHaveValue("Settings Panel Renamed", { timeout: 5_000 });
	});

	test("delete presentation from danger zone navigates to dashboard", async ({ page }) => {
		await page.getByRole("button", { name: "Delete presentation" }).click();
		await expect(page.getByRole("heading", { name: "Delete Presentation" })).toBeVisible();
		await page.getByRole("button", { name: "Delete" }).click();

		await expect(page).toHaveURL("/", { timeout: 10_000 });
		await expect(page.getByRole("heading", { name: "Presentations" })).toBeVisible();
	});
});

test.describe("Editor: file upload", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Upload Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Upload Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);
	});

	test("upload a CSS file and it appears in the sidebar", async ({ page }) => {
		await page.getByTitle("Upload file").click();
		await expect(page.getByRole("heading", { name: "Upload File" })).toBeVisible();

		await page.locator('input[type="file"]').setInputFiles({
			name: "theme.css",
			mimeType: "text/css",
			buffer: Buffer.from("body { color: red; }"),
		});
		await expect(page.getByText("theme.css")).toBeVisible();

		await page.getByRole("button", { name: "Upload", exact: true }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: "theme.css" })).toBeVisible({ timeout: 5_000 });
	});

	test("cancel upload closes the dialog without adding a file", async ({ page }) => {
		await page.getByTitle("Upload file").click();
		await expect(page.getByRole("heading", { name: "Upload File" })).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
	});

	test("upload button is disabled until a file is selected", async ({ page }) => {
		await page.getByTitle("Upload file").click();
		await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
	});
});

test.describe("Editor: export", () => {
	test("export project as ZIP triggers a download", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Export Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Export Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByTitle("Export project as ZIP").click(),
		]);
		expect(download.suggestedFilename()).toMatch(/\.zip$/);
	});
});

test.describe("Editor: outline panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Outline Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Outline Test");
		await page.waitForURL(/\/presentations\/.+/);
	});

	test("shows 'No headings' message when file has no headings", async ({ page }) => {
		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.type("Just plain text, no headings here.");

		await page
			.getByRole("button", { name: /^Outline/ })
			.first()
			.click();
		await expect(page.getByText("No headings in this file.")).toBeVisible({ timeout: 5_000 });
	});

	test("lists headings extracted from the markdown content", async ({ page }) => {
		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.type("# Introduction\n\n## Background\n\n# Conclusion");

		await page
			.getByRole("button", { name: /^Outline/ })
			.first()
			.click();
		await expect(page.getByRole("button", { name: "Introduction" })).toBeVisible({
			timeout: 5_000,
		});
		await expect(page.getByRole("button", { name: "Background" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Conclusion" })).toBeVisible();
	});
});

test.describe("Editor: search panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Search Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Search Test");
		await page.waitForURL(/\/presentations\/.+/);

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.type("Hello world\n\nHello again");

		await page
			.getByRole("button", { name: /^Search/ })
			.first()
			.click();
		await expect(page.getByLabel("Find")).toBeVisible({ timeout: 5_000 });
	});

	test("shows zero matches before a search is run", async ({ page }) => {
		await expect(page.getByText("0 matches")).toBeVisible();
	});

	test("find returns matches for text present in the file", async ({ page }) => {
		await page.getByLabel("Find").fill("Hello");
		await page.getByRole("button", { name: "Find" }).click();
		await expect(page.getByText("2 matches")).toBeVisible({ timeout: 5_000 });
	});

	test("find returns zero matches for text not in the file", async ({ page }) => {
		await page.getByLabel("Find").fill("zzznomatch");
		await page.getByRole("button", { name: "Find" }).click();
		await expect(page.getByText("0 matches")).toBeVisible({ timeout: 5_000 });
	});
});

test.describe("Editor: collaboration", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Collab Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Collab Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);
	});

	test("opens the Manage Collaboration dialog", async ({ page }) => {
		await page.getByRole("button", { name: "Share document" }).click();
		await expect(page.getByRole("heading", { name: "Manage Collaboration" })).toBeVisible();
		await expect(page.getByPlaceholder("Collaborator's email")).toBeVisible();
	});

	test("Add button is disabled with invalid email and enabled with valid email", async ({
		page,
	}) => {
		await page.getByRole("button", { name: "Share document" }).click();
		await expect(page.getByRole("heading", { name: "Manage Collaboration" })).toBeVisible();

		const addButton = page.getByRole("button", { name: "Add" });
		await expect(addButton).toBeDisabled();

		await page.getByPlaceholder("Collaborator's email").fill("not-an-email");
		await expect(addButton).toBeDisabled();

		await page.getByPlaceholder("Collaborator's email").fill("valid@example.com");
		await expect(addButton).toBeEnabled();
	});
});

test.describe("Presentation mode: slide counter and timer", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Counter Timer Test");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await clickLastCard(page, "Counter Timer Test");
		await page.waitForURL(/\/presentations\/.+/);

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.type("# Slide 1\n\n---\n\n# Slide 2\n\n---\n\n# Slide 3");

		await page.getByRole("button", { name: "Start presentation" }).click();
		await expect(page).toHaveURL(/mode=present/);
		await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 15_000 });
	});

	test("slide counter resets to slide 1 when clicked", async ({ page }) => {
		await page.getByRole("button", { name: "Next" }).click();
		await expect(page.getByText(/Slide 2/)).toBeVisible();

		await page.getByRole("button", { name: /Slide 2\// }).click();
		await expect(page.getByText(/Slide 1\//)).toBeVisible();
	});

	test("timer display is visible in presentation mode", async ({ page }) => {
		await expect(page.getByText(/^\d+:\d{2}$/)).toBeVisible({ timeout: 5_000 });
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
