import { after, before, describe, test } from "node:test";
import { equal, ok, rejects } from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("collab/pdf-export", () => {
	let tempDir: string;
	let files: typeof import("./files.ts");
	let pdfExport: typeof import("./pdf-export.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-pdf-export-"));
		process.env.DATA_PATH = tempDir;
		files = await import("./files.ts");
		pdfExport = await import("./pdf-export.ts");
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("rejects non-Markdown files", async () => {
		await files.saveProjectFile("pdf-proj", "logo.png", new Uint8Array([1, 2, 3]));

		await rejects(
			() => pdfExport.createDeckPdfFile("pdf-proj", "logo.png"),
			/Selected file must be a Markdown deck/,
		);
	});

	test("rejects path traversal file ids", async () => {
		await rejects(
			() => pdfExport.createDeckPdfFile("pdf-proj", "../escape.md"),
			/Invalid deck file path/,
		);
	});

	test("rejects missing Markdown files", async () => {
		await rejects(
			() => pdfExport.createDeckPdfFile("pdf-proj", "missing.md"),
			/Selected deck not found/,
		);
	});

	test("stages only project files, excludes .yjs files, and runs Marp with PDF args", async () => {
		await files.saveDocumentContent(
			files.toDocumentName("pdf-proj", "nested/slides.md"),
			"---\nmarp: true\n---\n\n# Export me\n\n![Logo](../assets/logo.png)",
		);
		await files.saveProjectFile("pdf-proj", "assets/logo.png", new Uint8Array([1, 2, 3]));
		await files.saveDocumentBinary(
			files.toDocumentName("pdf-proj", "nested/slides.md"),
			new Uint8Array([9, 8, 7]),
		);

		let stagedCwd = "";
		let runnerArgs: string[] = [];
		const result = await pdfExport.createDeckPdfFile("pdf-proj", "nested/slides.md", {
			runMarp: async (args, options) => {
				runnerArgs = args;
				stagedCwd = options.cwd;
				await rejects(() => stat(join(options.cwd, "nested/slides.md.yjs")));
				equal(
					await readFile(join(options.cwd, "nested/slides.md"), "utf8"),
					"---\nmarp: true\n---\n\n# Export me\n\n![Logo](../assets/logo.png)",
				);
				const outputIndex = args.indexOf("--output");
				ok(outputIndex > -1, "Marp args include --output");
				await writeFile(args[outputIndex + 1]!, "%PDF-1.4\n");
			},
		});

		equal(result.filename, "slides.pdf");
		equal(await readFile(result.path, "utf8"), "%PDF-1.4\n");
		ok(runnerArgs.includes("--pdf"));
		ok(runnerArgs.includes("--allow-local-files"));
		equal(runnerArgs.at(-1), join(stagedCwd, "nested/slides.md"));

		await result.cleanup();
		await rejects(() => stat(stagedCwd));
	});
});
