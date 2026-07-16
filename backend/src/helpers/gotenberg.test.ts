import { after, before, describe, test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RenderedPdfInput } from "../collab/marp-render.ts";

describe("Gotenberg PDF request", () => {
	let tempDir: string;
	let storage: typeof import("../projects/storage.ts");
	let renderPdfViaGotenberg: typeof import("./gotenberg.ts").renderPdfViaGotenberg;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "gotenberg-test-"));
		process.env.DATA_PATH = tempDir;
		process.env.GOTENBERG_URL = "http://pdf.test:3000";
		storage = await import("../projects/storage.ts");
		({ renderPdfViaGotenberg } = await import("./gotenberg.ts"));
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
		delete process.env.GOTENBERG_URL;
	});

	test("posts HTML, local assets, print options, and document metadata", async () => {
		await storage.saveProjectFile("pdf-request", "assets/local.png", new Uint8Array([1, 2, 3]));

		const rendered: RenderedPdfInput = {
			html: "<main>Quarterly Review</main>",
			css: "main { color: navy; }",
			assets: new Map([
				["assets/local.png", "asset0.png"],
				["assets/missing.png", "asset1.png"],
			]),
			title: "Quarterly Review",
			author: "Test Author",
			description: "Project status",
			keywords: ["one", "two"],
		};

		const originalFetch = globalThis.fetch;
		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = (input, init) => {
			capturedUrl =
				typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			capturedInit = init;
			return Promise.resolve(new Response("pdf", { status: 200 }));
		};

		try {
			const response = await renderPdfViaGotenberg("pdf-request", rendered);
			equal(await response.text(), "pdf");
		} finally {
			globalThis.fetch = originalFetch;
		}

		equal(capturedUrl, "http://pdf.test:3000/forms/chromium/convert/html");
		equal(capturedInit?.method, "POST");
		ok(capturedInit?.body instanceof FormData);

		const form = capturedInit.body;
		const uploadedFiles = form.getAll("files") as File[];
		deepEqual(
			uploadedFiles.map((file) => file.name),
			["index.html", "asset0.png"],
		);
		ok((await uploadedFiles[0]!.text()).includes("<main>Quarterly Review</main>"));
		deepEqual(Array.from(new Uint8Array(await uploadedFiles[1]!.arrayBuffer())), [1, 2, 3]);
		equal(form.get("printBackground"), "true");
		equal(form.get("preferCssPageSize"), "true");
		equal(form.get("emulatedMediaType"), "print");
		equal(form.get("waitDelay"), "2s");
		equal(form.get("generateDocumentOutline"), "true");
		const metadata = form.get("metadata");
		ok(typeof metadata === "string");
		deepEqual(JSON.parse(metadata), {
			Title: "Quarterly Review",
			Creator: "Marp Collab",
			Author: "Test Author",
			Subject: "Project status",
			Keywords: ["one", "two"],
		});
	});
});
