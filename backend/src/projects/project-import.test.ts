import { describe, test, before, after } from "node:test";
import { ok, equal, rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { crc32 } from "node:zlib";
import type { Readable } from "node:stream";
import { ZipArchive } from "archiver";

async function readAll(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

async function buildZip(entries: { name: string; content: string }[]): Promise<Uint8Array> {
	const archive = new ZipArchive({ zlib: { level: 9 } });
	for (const entry of entries) {
		archive.append(entry.content, { name: entry.name });
	}
	await archive.finalize();
	return new Uint8Array(await readAll(archive));
}

// archiver sanitizes entry names (stripping ".." segments) before writing them, so it
// can't produce a genuinely malicious zip-slip entry for testing. This builds a minimal
// single-entry, uncompressed ("stored") zip by hand, bypassing that sanitization.
function buildRawStoredZipWithUnsafeName(entryName: string, content: string): Uint8Array {
	const nameBuf = Buffer.from(entryName, "utf8");
	const contentBuf = Buffer.from(content, "utf8");
	const crc = crc32(contentBuf) >>> 0;

	const localHeader = Buffer.alloc(30);
	localHeader.writeUInt32LE(0x04034b50, 0);
	localHeader.writeUInt16LE(20, 4);
	localHeader.writeUInt32LE(crc, 14);
	localHeader.writeUInt32LE(contentBuf.length, 18);
	localHeader.writeUInt32LE(contentBuf.length, 22);
	localHeader.writeUInt16LE(nameBuf.length, 26);

	const centralHeader = Buffer.alloc(46);
	centralHeader.writeUInt32LE(0x02014b50, 0);
	centralHeader.writeUInt16LE(20, 4);
	centralHeader.writeUInt16LE(20, 6);
	centralHeader.writeUInt32LE(crc, 16);
	centralHeader.writeUInt32LE(contentBuf.length, 20);
	centralHeader.writeUInt32LE(contentBuf.length, 24);
	centralHeader.writeUInt16LE(nameBuf.length, 28);

	const localSection = Buffer.concat([localHeader, nameBuf, contentBuf]);
	const centralSection = Buffer.concat([centralHeader, nameBuf]);

	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(1, 8);
	eocd.writeUInt16LE(1, 10);
	eocd.writeUInt32LE(centralSection.length, 12);
	eocd.writeUInt32LE(localSection.length, 16);

	return new Uint8Array(Buffer.concat([localSection, centralSection, eocd]));
}

describe("project import", () => {
	let tempDir: string;
	let projectImport: typeof import("./project-import.ts");
	let storage: typeof import("./storage.ts");

	before(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "marp-test-import-"));
		process.env.DATA_PATH = tempDir;
		storage = await import("./storage.ts");
		projectImport = await import("./project-import.ts");
	});

	after(async () => {
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.DATA_PATH;
	});

	test("imports markdown and asset files, preserving nested paths", async () => {
		const zip = await buildZip([
			{ name: "presentation.md", content: "# Slide" },
			{ name: "theme/style.css", content: "body { color: red; }" },
			{ name: "assets/logo.jpg", content: "logo" },
		]);

		const result = await projectImport.importProjectFromZip("import-valid", zip);
		equal(result.fileCount, 3);
		equal(await storage.getDocumentContent("project/import-valid/presentation.md"), "# Slide");
		equal(
			await storage.getDocumentContent("project/import-valid/theme/style.css"),
			"body { color: red; }",
		);
		const asset = await storage.readProjectFile("import-valid", "assets/logo.jpg");
		equal(Buffer.from(asset!).toString("utf8"), "logo");
	});

	test("skips dotfiles and __MACOSX junk entries", async () => {
		const zip = await buildZip([
			{ name: "presentation.md", content: "# Slide" },
			{ name: ".DS_Store", content: "junk" },
			{ name: "__MACOSX/._presentation.md", content: "junk" },
		]);

		const result = await projectImport.importProjectFromZip("import-junk", zip);
		equal(result.fileCount, 1);
	});

	test("strips a single common top-level wrapping folder", async () => {
		const zip = await buildZip([
			{ name: "myproject/presentation.md", content: "# Slide" },
			{ name: "myproject/theme/style.css", content: "body {}" },
		]);

		await projectImport.importProjectFromZip("import-wrapped", zip);
		equal(await storage.getDocumentContent("project/import-wrapped/presentation.md"), "# Slide");
		ok(!(await storage.documentFileExists("project/import-wrapped/myproject/presentation.md")));
	});

	test("rejects a zip with zero importable files", async () => {
		const zip = await buildZip([{ name: ".DS_Store", content: "junk" }]);
		await rejects(
			() => projectImport.importProjectFromZip("import-empty", zip),
			/no importable files/,
		);
	});

	test("rejects a zip-slip entry and writes nothing to disk", async () => {
		// yauzl itself rejects ".." path segments before the entry is ever emitted.
		const zip = buildRawStoredZipWithUnsafeName("../escape.md", "evil");

		await rejects(
			() => projectImport.importProjectFromZip("import-slip", zip),
			/invalid relative path/i,
		);
		equal(await storage.documentFileExists("project/import-slip/escape.md"), false);
	});

	test("rejects a disallowed file extension and writes nothing to disk", async () => {
		const zip = await buildZip([
			{ name: "presentation.md", content: "# Slide" },
			{ name: "payload.exe", content: "evil" },
		]);

		await rejects(
			() => projectImport.importProjectFromZip("import-badext", zip),
			/file type not allowed/i,
		);
		equal(await storage.documentFileExists("project/import-badext/presentation.md"), false);
	});

	test("rejects a zip that exceeds the entry count limit", async () => {
		const entries = Array.from({ length: projectImport.MAX_IMPORT_ENTRY_COUNT + 1 }, (_, i) => ({
			name: `file-${i}.md`,
			content: "x",
		}));
		const zip = await buildZip(entries);

		await rejects(
			() => projectImport.importProjectFromZip("import-toomany", zip),
			/too many entries/i,
		);
	});
});
