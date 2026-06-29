import { describe, test } from "node:test";
import { equal } from "node:assert";
import {
	getFileType,
	getMimeType,
	isAllowedUpload,
	isEditableExtension,
} from "./file-allowlist.ts";

describe("file-allowlist", () => {
	test("getFileType should return correct file type based on extension", () => {
		equal(getFileType("test.md"), "markdown");
		equal(getFileType("test.markdown"), "markdown");
		equal(getFileType("test.jpg"), "asset");
		equal(getFileType(""), null);
		equal(getFileType("test.unknown"), null);
	});

	test("getFileType returns markdown for .css (editable extension)", () => {
		equal(getFileType("styles.css"), "markdown");
	});

	test("getFileType returns asset for video and font extensions", () => {
		equal(getFileType("video.mp4"), "asset");
		equal(getFileType("video.webm"), "asset");
		equal(getFileType("font.woff"), "asset");
		equal(getFileType("font.woff2"), "asset");
	});

	test("getMimeType should return correct MIME type based on extension", () => {
		equal(getMimeType("test.md"), "text/markdown");
		equal(getMimeType("test.markdown"), "text/markdown");
		equal(getMimeType("test.jpg"), "image/jpeg");
		equal(getMimeType("test.unknown"), "application/octet-stream");
	});

	test("getMimeType returns correct types for css, video, and font extensions", () => {
		equal(getMimeType("styles.css"), "text/css");
		equal(getMimeType("video.mp4"), "video/mp4");
		equal(getMimeType("video.webm"), "video/webm");
		equal(getMimeType("font.woff"), "font/woff");
		equal(getMimeType("font.woff2"), "font/woff2");
		equal(getMimeType("font.ttf"), "font/ttf");
	});

	test("isAllowedUpload should return true for allowed uploads", () => {
		equal(isAllowedUpload("test.jpg", "image/jpeg"), true);
		equal(isAllowedUpload("test.md", "text/markdown"), true);
		equal(isAllowedUpload("test.mp4", "video/mp4"), true);
		equal(isAllowedUpload("test.webm", "video/webm"), true);
	});

	test("isAllowedUpload should return false for disallowed uploads", () => {
		equal(isAllowedUpload("test.exe", "application/x-msdownload"), false);
		equal(isAllowedUpload("test.md", "text/plain"), false);
	});

	test("isAllowedUpload allows font files regardless of MIME type", () => {
		// Browsers report inconsistent MIME types for fonts
		equal(isAllowedUpload("icon.woff", "font/woff"), true);
		equal(isAllowedUpload("icon.woff", "application/octet-stream"), true);
		equal(isAllowedUpload("icon.woff2", "application/x-font-woff"), true);
		equal(isAllowedUpload("icon.ttf", "font/ttf"), true);
		equal(isAllowedUpload("icon.otf", "application/octet-stream"), true);
	});

	test("isAllowedUpload rejects css with wrong MIME type", () => {
		equal(isAllowedUpload("styles.css", "text/plain"), false);
		equal(isAllowedUpload("styles.css", "application/octet-stream"), false);
	});

	test("isAllowedUpload accepts css with correct MIME type", () => {
		equal(isAllowedUpload("styles.css", "text/css"), true);
	});

	test("isEditableExtension should return true for editable extensions", () => {
		equal(isEditableExtension("test.md"), true);
		equal(isEditableExtension("test.markdown"), true);
		equal(isEditableExtension("styles.css"), true);
	});

	test("isEditableExtension should return false for non-editable extensions", () => {
		equal(isEditableExtension("test.jpg"), false);
		equal(isEditableExtension("video.mp4"), false);
		equal(isEditableExtension("font.woff"), false);
	});
});
