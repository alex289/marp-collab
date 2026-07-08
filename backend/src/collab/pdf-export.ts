import { cp, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { marpCli } from "@marp-team/marp-cli";
import { isMarkdownFileId, resolveProjectDirPath, resolveProjectFilePath } from "./files.ts";

export type MarpRunner = (args: string[], options: { cwd: string }) => Promise<void>;

export class PdfExportError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "PdfExportError";
		this.status = status;
	}
}

type CreateDeckPdfFileOptions = {
	runMarp?: MarpRunner;
};

type DeckPdfFile = {
	path: string;
	filename: string;
	cleanup: () => Promise<void>;
};

let marpRunQueue = Promise.resolve();

async function reserveMarpRun(): Promise<() => void> {
	const previousRun = marpRunQueue;
	let releaseRun!: () => void;
	marpRunQueue = new Promise<void>((resolve) => {
		releaseRun = resolve;
	});
	await previousRun;
	return releaseRun;
}

export const runMarpCli: MarpRunner = async (args, options) => {
	const releaseRun = await reserveMarpRun();
	const previousCwd = process.cwd();
	try {
		process.chdir(options.cwd);
		const exitCode = await marpCli(args);
		if (exitCode !== 0) {
			throw new Error(`Marp CLI exited with status ${exitCode}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Marp CLI failed";
		throw new Error(`Marp CLI failed: ${message}`);
	} finally {
		try {
			process.chdir(previousCwd);
		} finally {
			releaseRun();
		}
	}
};

function outputFilename(fileId: string): string {
	const ext = extname(fileId);
	const base = basename(fileId, ext)
		.replace(/\s+/g, "-")
		.replace(/[^a-zA-Z0-9._-]/g, "")
		.slice(0, 160);
	return `${base || "presentation"}.pdf`;
}

function isMissingFileError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function assertDeckFileExists(deckPath: string): Promise<void> {
	try {
		const deckStat = await stat(deckPath);
		if (!deckStat.isFile()) {
			throw new PdfExportError(404, "Selected deck not found");
		}
	} catch (error) {
		if (isMissingFileError(error)) {
			throw new PdfExportError(404, "Selected deck not found");
		}
		throw error;
	}
}

async function collectCssFiles(dir: string): Promise<string[]> {
	const results: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.name.startsWith(".")) {
			continue;
		}

		const entryPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await collectCssFiles(entryPath)));
			continue;
		}

		if (entry.isFile() && extname(entry.name).toLowerCase() === ".css") {
			results.push(entryPath);
		}
	}

	return results.sort((left, right) => relative(dir, left).localeCompare(relative(dir, right)));
}

function browserPathArgs(): string[] {
	const browserPath =
		process.env.MARP_CHROME_PATH ??
		process.env.PUPPETEER_EXECUTABLE_PATH ??
		process.env.CHROME_PATH ??
		"";
	return browserPath ? ["--browser-path", browserPath] : [];
}

export async function createDeckPdfFile(
	projectId: string,
	fileId: string,
	options: CreateDeckPdfFileOptions = {},
): Promise<DeckPdfFile> {
	if (!isMarkdownFileId(fileId)) {
		throw new PdfExportError(400, "Selected file must be a Markdown deck");
	}

	const deckPath = resolveProjectFilePath(projectId, fileId);
	if (!deckPath) {
		throw new PdfExportError(400, "Invalid deck file path");
	}

	await assertDeckFileExists(deckPath);

	const projectDir = resolveProjectDirPath(projectId);
	if (!projectDir) {
		throw new PdfExportError(400, "Invalid project path");
	}

	const tempRoot = await mkdtemp(join(tmpdir(), "marp-pdf-"));
	const stagedProjectDir = join(tempRoot, "project");
	const filename = outputFilename(fileId);
	const outputPath = join(tempRoot, filename);
	const cleanup = async () => {
		await rm(tempRoot, { recursive: true, force: true });
	};

	try {
		await cp(projectDir, stagedProjectDir, {
			recursive: true,
			filter: (source) => {
				const sourceName = basename(source);
				return !sourceName.startsWith(".") && extname(sourceName).toLowerCase() !== ".yjs";
			},
		});

		const stagedDeckPath = join(stagedProjectDir, fileId);
		const themeFiles = await collectCssFiles(stagedProjectDir);
		const args = [
			"--pdf",
			"--allow-local-files",
			...browserPathArgs(),
			...(themeFiles.length > 0 ? ["--theme-set", ...themeFiles] : []),
			"--output",
			outputPath,
			stagedDeckPath,
		];

		await (options.runMarp ?? runMarpCli)(args, { cwd: stagedProjectDir });

		return {
			path: outputPath,
			filename,
			cleanup,
		};
	} catch (error) {
		await cleanup();
		if (error instanceof PdfExportError) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Failed to generate PDF";
		throw new PdfExportError(500, message);
	}
}
