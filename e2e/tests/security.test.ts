import { test, expect } from "@playwright/test";
import { APP_URL } from "./const.ts";

// Run all tests in this file without authentication
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("security headers", () => {
	test("are present on every response", async ({ request }) => {
		const response = await request.get("/api/v1/health");
		const h = response.headers();

		expect(h["x-content-type-options"]).toBe("nosniff");
		expect(h["x-frame-options"]).toBe("SAMEORIGIN");
		expect(h["referrer-policy"]).toBe("no-referrer");
		expect(h["cross-origin-opener-policy"]).toBe("same-origin");
		expect(h["cross-origin-resource-policy"]).toBe("same-origin");
		expect(h["x-powered-by"]).toBeUndefined();
		expect(h["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
	});
});

test.describe("protected API routes require authentication", () => {
	test("GET /api/v1/projects returns 401", async ({ request }) => {
		expect((await request.get("/api/v1/projects")).status()).toBe(401);
	});
	test("POST /api/v1/projects returns 401", async ({ request }) => {
		expect(
			(
				await request.post("/api/v1/projects", {
					data: { foo: "bar" },
					headers: { Origin: APP_URL },
				})
			).status(),
		).toBe(401);
	});
});
