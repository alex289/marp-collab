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
	let renderSlideScreenshotViaGotenberg: typeof import("./gotenberg.ts").renderSlideScreenshotViaGotenberg;

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "gotenberg-test-"));
		process.env.DATA_PATH = tempDir;
		process.env.GOTENBERG_URL = "http://pdf.test:3000";
		storage = await import("../projects/storage.ts");
		({ renderPdfViaGotenberg, renderSlideScreenshotViaGotenberg } = await import("./gotenberg.ts"));
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
		const indexHtml = await uploadedFiles[0]!.text();
		ok(indexHtml.includes("<main>Quarterly Review</main>"));
		// The policy precedes the deck's CSS so it covers every resource the CSS loads.
		ok(indexHtml.indexOf('http-equiv="Content-Security-Policy"') < indexHtml.indexOf("<style>"));
		deepEqual(Array.from(new Uint8Array(await uploadedFiles[1]!.arrayBuffer())), [1, 2, 3]);
		equal(form.get("printBackground"), "true");
		equal(form.get("preferCssPageSize"), "true");
		equal(form.get("emulatedMediaType"), "print");
		equal(form.get("waitDelay"), "2s");
		equal(form.get("nativeBookmarks"), "true");
		const stages = form.get("stages");
		ok(typeof stages === "string");
		deepEqual(JSON.parse(stages), [
			{
				op: "set-metadata",
				title: "Quarterly Review",
				creator: "Marp Collab",
				author: "Test Author",
				subject: "Project status",
				keywords: "one, two",
			},
		]);
	});

	test("allows exactly Marp's own inline script in the PDF policy", async () => {
		const { Marp } = await import("@marp-team/marp-core");
		const { createHash } = await import("node:crypto");
		const { PDF_CONTENT_SECURITY_POLICY } = await import("./gotenberg.ts");
		const html = new Marp().render("# Deck").html;
		const start = html.indexOf("<script>") + "<script>".length;
		const script = html.slice(start, html.indexOf("</script>", start));
		ok(script.length > 1000);
		const hash = createHash("sha256").update(script).digest("base64");
		ok(PDF_CONTENT_SECURITY_POLICY.includes(`script-src 'sha256-${hash}';`));
		ok(PDF_CONTENT_SECURITY_POLICY.startsWith("default-src 'none'"));
		ok(PDF_CONTENT_SECURITY_POLICY.includes("img-src file: data:;"));
	});

	test("posts single-slide screenshot with CSP, inline script, dimensions, and only referenced assets", async () => {
		await storage.saveProjectFile("shot-request", "assets/used.png", new Uint8Array([4, 5, 6]));
		await storage.saveProjectFile("shot-request", "assets/unused.png", new Uint8Array([7, 8, 9]));

		const originalFetch = globalThis.fetch;
		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = (input, init) => {
			capturedUrl =
				typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			capturedInit = init;
			return Promise.resolve(new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 }));
		};

		try {
			const response = await renderSlideScreenshotViaGotenberg(
				"shot-request",
				{
					html: '<svg data-marpit-svg="" viewBox="0 0 960 720"><foreignObject><section><img src="asset0.png" /></section></foreignObject></svg>',
					width: 960,
					height: 720,
				},
				"section { color: navy; }",
				new Map([
					["assets/used.png", "asset0.png"],
					["assets/unused.png", "asset1.png"],
				]),
				{ format: "jpeg" },
			);
			equal(response.status, 200);
		} finally {
			globalThis.fetch = originalFetch;
		}

		equal(capturedUrl, "http://pdf.test:3000/forms/chromium/screenshot/html");
		equal(capturedInit?.method, "POST");
		ok(capturedInit?.body instanceof FormData);

		const form = capturedInit.body;
		const uploadedFiles = form.getAll("files") as File[];
		deepEqual(
			uploadedFiles.map((file) => file.name),
			["index.html", "asset0.png"],
		);
		const indexHtml = await uploadedFiles[0]!.text();
		ok(indexHtml.includes('<div class="marpit"><svg data-marpit-svg=""'));
		ok(indexHtml.includes("<script>"));
		ok(indexHtml.indexOf('http-equiv="Content-Security-Policy"') < indexHtml.indexOf("<style>"));
		equal(form.get("width"), "960");
		equal(form.get("height"), "720");
		equal(form.get("clip"), "true");
		equal(form.get("format"), "jpeg");
		equal(form.get("quality"), "85");
		equal(form.get("optimizeForSpeed"), "true");
		equal(form.get("emulatedMediaType"), "screen");
		equal(form.get("waitDelay"), "1s");
	});
});
