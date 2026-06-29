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

	test("getMimeType should return correct MIME type based on extension", () => {
		equal(getMimeType("test.md"), "text/markdown");
		equal(getMimeType("test.markdown"), "text/markdown");
		equal(getMimeType("test.jpg"), "image/jpeg");
		equal(getMimeType("test.unknown"), "application/octet-stream");
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

	test("isEditableExtension should return true for editable extensions", () => {
		equal(isEditableExtension("test.md"), true);
		equal(isEditableExtension("test.markdown"), true);
		equal(isEditableExtension("styles.css"), true);
	});

	test("isEditableExtension should return false for non-editable extensions", () => {
		equal(isEditableExtension("test.jpg"), false);
	});
});
