import { describe, test, beforeEach, afterEach } from "node:test";
import { equal } from "node:assert";
import { signAssetToken, verifyAssetToken } from "./asset-token.ts";

describe("asset-token", () => {
	beforeEach(() => {
		process.env.AUTH_SECRET = "test-secret";
	});

	afterEach(() => {
		delete process.env.AUTH_SECRET;
	});

	test("verifyAssetToken accepts a freshly signed token for its project", () => {
		const token = signAssetToken("project-1");
		equal(verifyAssetToken(token, "project-1"), true);
	});

	test("signAssetToken is stable across requests so asset URLs stay cacheable", () => {
		equal(signAssetToken("project-1"), signAssetToken("project-1"));
	});

	test("verifyAssetToken rejects a token for a different project", () => {
		const token = signAssetToken("project-1");
		equal(verifyAssetToken(token, "project-2"), false);
	});

	test("verifyAssetToken rejects an expired token", () => {
		const token = signAssetToken("project-1", -1);
		equal(verifyAssetToken(token, "project-1"), false);
	});

	test("verifyAssetToken rejects a tampered signature", () => {
		const token = signAssetToken("project-1");
		const [payload] = token.split(".");
		equal(verifyAssetToken(`${payload}.not-a-real-signature`, "project-1"), false);
	});

	test("verifyAssetToken rejects a tampered payload", () => {
		const token = signAssetToken("project-1");
		const [, signature] = token.split(".");
		const forgedPayload = Buffer.from(
			JSON.stringify({ projectId: "project-2", expires: Date.now() + 60_000 }),
		).toString("base64url");
		equal(verifyAssetToken(`${forgedPayload}.${signature}`, "project-2"), false);
	});

	test("verifyAssetToken rejects malformed tokens", () => {
		equal(verifyAssetToken("not-a-token", "project-1"), false);
		equal(verifyAssetToken("", "project-1"), false);
	});
});
