import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const { version: APP_VERSION } = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

const PRESENTATION_NAME = "E2E Test Presentation";
const MARKDOWN_FILE_NAME = "slides.md";
const CSS_FILE_NAME = "custom.css";
const FOLDER_NAME = "assets";

async function waitForSidebar(page: Page) {
	await expect(page.getByRole("button", { name: "presentation.md" })).toBeVisible({
		timeout: 10_000,
	});
}

async function fillPresentationName(page: Page, name: string) {
	await page.getByRole("textbox", { name: "Name" }).fill(name);
}

async function createPresentation(page: Page, name: string, template?: "default" | "whs") {
	await page.getByRole("button", { name: "Create Presentation" }).click();
	await fillPresentationName(page, name);
	await page.getByRole("button", { name: "Continue" }).click();
	if (template === "whs") {
		await page.getByRole("button", { name: "Westfälische Hochschule" }).click();
	}
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
}

async function fillNewFileName(page: Page, fileName: string) {
	await page.getByRole("textbox", { name: "File name" }).fill(fileName);
}

async function dropFileOnSidebarButton(
	page: Page,
	buttonName: string,
	file: { name: string; mimeType: string; content: string },
) {
	await page.getByRole("button", { name: buttonName }).evaluate((element, droppedFile) => {
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(
			new File([droppedFile.content], droppedFile.name, { type: droppedFile.mimeType }),
		);

		element.dispatchEvent(
			new DragEvent("dragover", {
				bubbles: true,
				cancelable: true,
				dataTransfer,
			}),
		);
		element.dispatchEvent(
			new DragEvent("drop", {
				bubbles: true,
				cancelable: true,
				dataTransfer,
			}),
		);
	}, file);
}

async function dropFileOnEditorLine(
	page: Page,
	lineText: string,
	file: { name: string; mimeType: string; content: string },
) {
	const line = page.locator(".cm-line").filter({ hasText: lineText });
	await expect(line).toBeVisible();
	await line.evaluate((element, droppedFile) => {
		const rect = element.getBoundingClientRect();
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(
			new File([droppedFile.content], droppedFile.name, { type: droppedFile.mimeType }),
		);
		const eventOptions = {
			bubbles: true,
			cancelable: true,
			clientX: rect.left + 4,
			clientY: rect.top + rect.height / 2,
			dataTransfer,
		};

		element.dispatchEvent(new DragEvent("dragover", eventOptions));
		element.dispatchEvent(new DragEvent("drop", eventOptions));
	}, file);
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
	await menuItem.getByRole("button", { name: kind, exact: true }).click();
}

async function clickSidebarRename(
	page: Page,
	itemName: string,
	kind: "Rename file" | "Rename folder",
) {
	const menuItem = page.locator('[data-sidebar="menu-item"]').filter({
		has: page.getByRole("button", { name: itemName }),
	});
	await menuItem.getByRole("button", { name: itemName }).hover();
	await menuItem.getByRole("button", { name: kind, exact: true }).click();
}

async function getPreviewImageReference(page: Page) {
	// The preview iframe is sandboxed without allow-same-origin, so
	// iframe.contentDocument is inaccessible from the parent frame's JS context.
	// frameLocator reaches into the frame via Playwright's own protocol instead.
	const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
	const image = previewFrame.locator("img, image").first();
	if ((await image.count()) === 0) {
		return "";
	}
	return await image.evaluate((el: Element) => {
		if (el instanceof HTMLImageElement) {
			return el.getAttribute("src") || el.src;
		}
		if (el instanceof SVGImageElement) {
			return (
				el.href.baseVal ||
				el.getAttribute("href") ||
				el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
				el.getAttribute("xlink:href") ||
				""
			);
		}
		return el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "";
	});
}

async function getPreviewSectionBackground(page: Page) {
	const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
	return await previewFrame
		.locator("section")
		.first()
		.evaluate((section) => window.getComputedStyle(section).backgroundColor);
}

async function getPreviewSlideMetrics(page: Page) {
	// Same cross-origin constraint as getPreviewImageReference: measure the
	// iframe element from the parent and the slide from within via frameLocator.
	const iframeBox = await page.locator('iframe[title="Marp preview"]').boundingBox();
	const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
	const slideBox = await previewFrame
		.locator("svg[data-marpit-svg], section")
		.first()
		.boundingBox();

	return {
		iframeWidth: iframeBox?.width ?? 0,
		slideWidth: slideBox?.width ?? 0,
	};
}

test.describe("Dashboard", () => {
	test("shows empty state on a fresh account", async ({ page }) => {
		await page.goto("/");

		await expect(page.getByRole("heading", { name: "Presentations" })).toBeVisible();
		await expect(page.getByText("No presentations yet")).toBeVisible();
		await expect(page.getByRole("button", { name: "Create Presentation" })).toBeVisible();
		await expect(page.getByText(`Marp Collab v${APP_VERSION}`)).toBeVisible();
	});
});

test.describe("Presentation lifecycle", () => {
	test("create a presentation and open it", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Create Presentation" })).toBeVisible();

		await fillPresentationName(page, PRESENTATION_NAME);
		await page.getByRole("button", { name: "Continue" }).click();

		await expect(page.getByRole("heading", { name: "Choose a Theme" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Default" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Westfälische Hochschule" })).toBeVisible();

		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page).toHaveURL(/\/presentations\/.+/);

		await waitForSidebar(page);
		await expect(page).toHaveTitle(`${PRESENTATION_NAME} - MarpCollab`);
	});

	test("create dialog validates required name", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();

		await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
	});

	test("cancel create dialog discards input", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Draft");
		await page.getByRole("button", { name: "Cancel" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByText("Draft")).not.toBeVisible();
	});

	test("back button returns to the name step and preserves the name", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Back Step Test");
		await page.getByRole("button", { name: "Continue" }).click();
		await expect(page.getByRole("heading", { name: "Choose a Theme" })).toBeVisible();

		await page.getByRole("button", { name: "Back" }).click();

		await expect(page.getByRole("heading", { name: "Create Presentation" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Back Step Test");
	});

	test("closing the dialog resets the theme step back to the name step", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await fillPresentationName(page, "Reset Step Test");
		await page.getByRole("button", { name: "Continue" }).click();
		await expect(page.getByRole("heading", { name: "Choose a Theme" })).toBeVisible();

		await page.getByRole("button", { name: "Close" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await page.getByRole("button", { name: "Create Presentation" }).click();
		await expect(page.getByRole("heading", { name: "Create Presentation" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("");
	});

	test("creates a presentation seeded with the selected theme", async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, "WHS Theme Test", "whs");

		await expect(page).toHaveURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		await expect(page.getByRole("button", { name: "theme", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "theme", exact: true }).click();
		await expect(page.getByRole("button", { name: "theme.css" })).toBeVisible();
		await expect(page.getByRole("button", { name: "whs-logo.svg" })).toBeVisible();
	});
});

test.describe("Editor page — file management", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, PRESENTATION_NAME);

		await page.waitForURL(/\/presentations\/.+/);

		await waitForSidebar(page);
	});

	test("editor layout is visible with sidebar and panes", async ({ page }) => {
		await expect(page.getByRole("button", { name: "presentation.md" })).toBeVisible();
		await expect(page.locator(".cm-editor")).toBeVisible();
		await expect(page.locator('iframe[title="Marp preview"]')).toBeVisible();
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
	test("rename a selected markdown file", async ({ page }) => {
		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, "rename-me.md");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await page.getByRole("button", { name: "rename-me.md" }).click();
		await expect(page.getByText("Active file: rename-me.md")).toBeVisible();

		await clickSidebarRename(page, "rename-me.md", "Rename file");
		await expect(page.getByRole("heading", { name: "Rename File" })).toBeVisible();
		await page.getByRole("textbox", { name: "Name" }).fill("renamed.md");
		await page.getByRole("button", { name: "Rename" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: "renamed.md" })).toBeVisible();
		await expect(page.getByText("rename-me.md")).not.toBeVisible();
		await expect(page.getByText("Active file: renamed.md")).toBeVisible();
	});

	test("rename a folder and keep nested files visible", async ({ page }) => {
		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, "old-folder/nested.md");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();

		await page.getByRole("button", { name: "old-folder" }).click();
		await expect(page.getByRole("button", { name: "nested.md" })).toBeVisible();

		await clickSidebarRename(page, "old-folder", "Rename folder");
		await expect(page.getByRole("heading", { name: "Rename Folder" })).toBeVisible();
		await page.getByRole("textbox", { name: "Name" }).fill("new-folder");
		await page.getByRole("button", { name: "Rename" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: "new-folder" })).toBeVisible();
		await expect(page.getByRole("button", { name: "nested.md" })).toBeVisible();
		await expect(page.getByText("old-folder")).not.toBeVisible();
	});

	test("previews an uploaded image from the sidebar", async ({ page }) => {
		await page.getByRole("button", { name: "Upload file" }).click();
		await page.locator('input[type="file"]').setInputFiles({
			name: "preview.png",
			mimeType: "image/png",
			buffer: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
				"base64",
			),
		});
		await page.getByRole("button", { name: "Upload", exact: true }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: "preview.png" })).toBeVisible({
			timeout: 5_000,
		});

		await page.getByRole("button", { name: "preview.png" }).click();

		await expect(page.getByRole("heading", { name: "preview.png" })).toBeVisible();
		const image = page.getByRole("img", { name: "preview.png" });
		await expect(image).toBeVisible();
		await expect(image).toHaveAttribute("src", /\/projects\/.+\/files\/preview\.png$/);
		await expect(page.getByText("Active file: presentation.md")).toBeVisible();
	});
});

test.describe("Editor: content editing", () => {
	test("type into the CodeMirror editor and see live preview update", async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, "Editor Flow Test");
		await page.waitForURL(/\/presentations\/.+/);

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });

		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
		await page.keyboard.type("# Hello World");

		const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
		await expect(previewFrame.getByRole("heading", { name: "Hello World" })).toBeVisible({
			timeout: 10_000,
		});
	});

	test("drop an image into the editor and insert it at the dropped line", async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, "Editor Image Drop Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
		await page.keyboard.insertText("# Before\nDrop target\nAfter");

		await dropFileOnEditorLine(page, "Drop target", {
			name: "Dropped Image.PNG",
			mimeType: "image/png",
			content: "image data",
		});

		await expect(page.getByRole("button", { name: "dropped-image.png" })).toBeVisible({
			timeout: 5_000,
		});
		const lines = page.locator(".cm-line");
		await expect(lines).toHaveCount(4);
		await expect(lines.nth(0)).toHaveText("# Before");
		await expect(lines.nth(1)).toHaveText("![dropped-image](dropped-image.png)");
		await expect(lines.nth(2)).toHaveText("Drop target");
		await expect(lines.nth(3)).toHaveText("After");
	});

	test("fits the live preview slide inside a phone-width preview pane", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");

		await createPresentation(page, "Mobile Preview Fit Test");
		await page.waitForURL(/\/presentations\/.+/);

		const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
		await expect(previewFrame.locator("svg[data-marpit-svg], section").first()).toBeVisible({
			timeout: 10_000,
		});

		await expect
			.poll(async () => {
				const metrics = await getPreviewSlideMetrics(page);
				return metrics.slideWidth > 0 && metrics.slideWidth <= metrics.iframeWidth;
			})
			.toBe(true);
	});

	test("keeps markdown image paths rooted to the markdown file while editing CSS in a folder", async ({
		page,
	}) => {
		await page.goto("/");

		await createPresentation(page, "CSS Folder Preview Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		await page.getByRole("button", { name: "Upload file" }).click();
		await page.locator('input[type="file"]').setInputFiles({
			name: "photo.png",
			mimeType: "image/png",
			buffer: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
				"base64",
			),
		});
		await page.getByRole("button", { name: "Upload", exact: true }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: "photo.png" })).toBeVisible({ timeout: 5_000 });

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
		await page.keyboard.type("![photo](photo.png)");

		await expect.poll(() => getPreviewImageReference(page)).toContain("/projects/");
		await expect.poll(() => getPreviewImageReference(page)).toContain("/files/photo.png");

		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, "themes/theme.css");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await page.getByRole("button", { name: "themes" }).click();
		await page.getByRole("button", { name: "theme.css" }).click();

		await expect(page.getByText("Active file: presentation.md")).toBeVisible();
		await expect.poll(() => getPreviewImageReference(page)).toContain("/files/photo.png");
		await expect
			.poll(() => getPreviewImageReference(page))
			.not.toContain("/files/themes/photo.png");
	});

	test("applies CSS theme edits to the preview without reloading the page", async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, "Live CSS Theme Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		await page.getByRole("button", { name: "Upload file" }).click();
		await page.locator('input[type="file"]').setInputFiles({
			name: "live-theme.css",
			mimeType: "text/css",
			buffer: Buffer.from(
				"/* @theme live-theme */\nsection { background: rgb(1, 2, 3); color: white; }",
			),
		});
		await page.getByRole("button", { name: "Upload", exact: true }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: "live-theme.css" })).toBeVisible({
			timeout: 5_000,
		});

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
		await page.keyboard.type("---\nmarp: true\ntheme: live-theme\n---\n\n# Live Theme");

		const previewFrame = page.frameLocator('iframe[title="Marp preview"]');
		await expect(previewFrame.getByRole("heading", { name: "Live Theme" })).toBeVisible({
			timeout: 10_000,
		});
		await expect.poll(() => getPreviewSectionBackground(page)).toBe("rgb(1, 2, 3)");

		await page.getByRole("button", { name: "live-theme.css" }).click();
		await expect(editor).toContainText("background: rgb(1, 2, 3)");
		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
		await page.keyboard.type(
			"/* @theme live-theme */\nsection { background: rgb(10, 20, 30); color: white; }",
		);

		await expect.poll(() => getPreviewSectionBackground(page)).toBe("rgb(10, 20, 30)");
	});
});

test.describe("Presentation mode", () => {
	test("applies a custom theme after opening before theme CSS finishes loading", async ({
		page,
	}) => {
		await page.goto("/");

		await createPresentation(page, "Delayed Theme Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		let releaseCss!: () => void;
		const cssBlocked = new Promise<void>((resolve) => {
			releaseCss = resolve;
		});
		await page
			.context()
			.route(/\/api\/v1\/projects\/[^/]+\/files\/race-theme\.css$/, async (route) => {
				await cssBlocked;
				await route.continue();
			});

		await page.getByRole("button", { name: "Upload file" }).click();
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
		await page.keyboard.press("ControlOrMeta+A");
		await page.keyboard.type("---\nmarp: true\ntheme: race-theme\n---\n\n# Race Theme");

		const presentationUrl = page.url();
		const presentationPage = await page.context().newPage();
		await presentationPage.goto(`${presentationUrl}?mode=present`);
		const presentationFrame = presentationPage.frameLocator('iframe[title="Presentation"]');
		await expect(presentationFrame.getByRole("heading", { name: "Race Theme" })).toBeVisible({
			timeout: 10_000,
		});

		releaseCss();

		await expect(presentationFrame.locator("section").first()).toHaveCSS(
			"background-color",
			"rgb(1, 2, 3)",
		);
		await presentationPage.close();
	});

	test("start and end a presentation", async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, "Presentation Mode Test");
		await page.waitForURL(/\/presentations\/.+/);

		await waitForSidebar(page);

		await page.getByRole("button", { name: "Start" }).click();
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
		await expect(page.locator(".cm-editor")).toBeVisible();
	});

	test("Escape key exits presentation mode", async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, "Escape Test");
		await page.waitForURL(/\/presentations\/.+/);

		await expect(page.getByRole("button", { name: "Start" })).toBeVisible({
			timeout: 10_000,
		});

		await page.getByRole("button", { name: "Start" }).click();
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
		await createPresentation(page, ORIGINAL);
		await page.goto("/");

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
		await createPresentation(page, NAME);
		await page.goto("/");

		await page.getByRole("button", { name: `Rename ${NAME}` }).click();
		await expect(page.getByRole("heading", { name: "Rename Presentation" })).toBeVisible();

		await expect(page.getByRole("button", { name: "Rename" })).toBeDisabled();
	});

	test("cancel rename keeps the original name", async ({ page }) => {
		const NAME = "Cancel Rename Test";
		await page.goto("/");
		await createPresentation(page, NAME);
		await page.goto("/");

		await page.getByRole("button", { name: `Rename ${NAME}` }).click();
		await expect(page.getByRole("heading", { name: "Rename Presentation" })).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();

		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("link", { name: new RegExp(NAME) })).toBeVisible();
	});

	test("delete a presentation from the card", async ({ page }) => {
		const NAME = "Card Delete Test";
		await page.goto("/");
		await createPresentation(page, NAME);
		await page.goto("/");
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
		await createPresentation(page, NAME);
		await page.goto("/");

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
		await createPresentation(page, "Settings Panel Test");
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
		await createPresentation(page, "Upload Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);
	});

	test("upload a CSS file and it appears in the sidebar", async ({ page }) => {
		await page.getByRole("button", { name: "Upload file" }).click();
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

	test("drop a file on a sidebar folder and it appears inside the folder", async ({ page }) => {
		await page.getByRole("button", { name: "New folder" }).click();
		await page.getByLabel("Folder name").fill("drop-assets");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: "drop-assets" })).toBeVisible();

		await dropFileOnSidebarButton(page, "drop-assets", {
			name: "folder-theme.css",
			mimeType: "text/css",
			content: "section { color: blue; }",
		});

		await expect(page.getByRole("button", { name: "folder-theme.css" })).not.toBeVisible();
		await page.getByRole("button", { name: "drop-assets" }).click();
		await expect(page.getByRole("button", { name: "folder-theme.css" })).toBeVisible({
			timeout: 5_000,
		});
	});

	test("cancel upload closes the dialog without adding a file", async ({ page }) => {
		await page.getByRole("button", { name: "Upload file" }).click();
		await expect(page.getByRole("heading", { name: "Upload File" })).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
	});

	test("upload button is disabled until a file is selected", async ({ page }) => {
		await page.getByRole("button", { name: "Upload file" }).click();
		await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
	});
});

test.describe("Editor: export", () => {
	test("export project as ZIP triggers a download", async ({ page }) => {
		await page.goto("/");
		await createPresentation(page, "Export Test");
		await page.waitForURL(/\/presentations\/.+/);
		await waitForSidebar(page);

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "Export project as ZIP" }).click(),
		]);
		expect(download.suggestedFilename()).toMatch(/\.zip$/);
	});
});

test.describe("Editor: outline panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await createPresentation(page, "Outline Test");
		await page.waitForURL(/\/presentations\/.+/);
	});

	test("shows 'No headings' message when file has no headings", async ({ page }) => {
		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
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
		await page.keyboard.press("ControlOrMeta+A");
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
		await createPresentation(page, "Search Test");
		await page.waitForURL(/\/presentations\/.+/);

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
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
		await createPresentation(page, "Collab Test");
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

	test("does not show the current user's own file presence in the sidebar", async ({
		page,
		browser,
	}) => {
		await page.getByRole("button", { name: "New file" }).click();
		await fillNewFileName(page, MARKDOWN_FILE_NAME);
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await expect(page.getByRole("button", { name: MARKDOWN_FILE_NAME })).toBeVisible();

		const collaboratorContext = await browser.newContext({
			storageState: "playwright/.auth/user.json",
		});
		const collaboratorPage = await collaboratorContext.newPage();
		try {
			await collaboratorPage.goto(page.url());
			await waitForSidebar(collaboratorPage);
			await collaboratorPage.getByRole("button", { name: MARKDOWN_FILE_NAME }).click();
			await expect(collaboratorPage.getByText(`Active file: ${MARKDOWN_FILE_NAME}`)).toBeVisible();

			const fileRow = page.locator('[data-sidebar="menu-item"]').filter({
				has: page.getByRole("button", { name: MARKDOWN_FILE_NAME }),
			});
			await expect(fileRow.getByLabel(`Users viewing ${MARKDOWN_FILE_NAME}: Test User`)).toBeHidden(
				{ timeout: 10_000 },
			);
		} finally {
			await collaboratorContext.close();
		}
	});
});

test.describe("Presentation mode: slide counter and timer", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await createPresentation(page, "Counter Timer Test");
		await page.waitForURL(/\/presentations\/.+/);

		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.press("ControlOrMeta+A");
		await page.keyboard.type("# Slide 1\n\n---\n\n# Slide 2\n\n---\n\n# Slide 3");

		await page.getByRole("button", { name: "Start" }).click();
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
	test("back link navigates to the dashboard", async ({ page }) => {
		await page.goto("/");

		await createPresentation(page, "Nav Test");
		await page.waitForURL(/\/presentations\/.+/);

		await page.getByRole("link", { name: "Back to presentations" }).click();
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
