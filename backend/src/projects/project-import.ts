import { buffer as readEntryStreamToBuffer } from "node:stream/consumers";
import { fromBufferPromise } from "yauzl";
import { getFileType, isEditableExtension } from "../helpers/file-allowlist.ts";
import { toDocumentName } from "../../../shared/collaboration.ts";
import {
	MAX_PROJECT_CONTENT_BYTES,
	MAX_PROJECT_FILE_BYTES,
	MAX_PROJECT_FILE_COUNT,
} from "./content-limits.ts";
import { isValidProjectFileLocation, saveDocumentContent, saveProjectFile } from "./storage.ts";

export type ImportResult = {
	fileCount: number;
};

function isJunkEntryPath(fileName: string): boolean {
	if (fileName.startsWith("__MACOSX/")) {
		return true;
	}
	return fileName.split("/").some((segment) => segment.startsWith("."));
}

// Strip a common archive wrapper so its contents land at the project root.
function detectCommonTopLevelFolder(fileNames: string[]): string {
	if (fileNames.length === 0) {
		return "";
	}

	const [first, ...rest] = fileNames.map((name) => name.split("/")[0]);
	const allNested = fileNames.every((name) => name.includes("/"));
	if (allNested && first && rest.every((segment) => segment === first)) {
		return `${first}/`;
	}

	return "";
}

export async function importProjectFromZip(
	projectId: string,
	zipData: Uint8Array,
): Promise<ImportResult> {
	const buffer = Buffer.from(zipData);

	// Check entry limits and file types before writing any files.
	const validationZip = await fromBufferPromise(buffer, { lazyEntries: true, autoClose: true });
	let entryCount = 0;
	let totalUncompressedBytes = 0;
	const importableFileNames: string[] = [];

	for await (const entry of validationZip.eachEntry()) {
		entryCount++;
		if (entryCount > MAX_PROJECT_FILE_COUNT) {
			throw new Error(`Zip file contains too many entries (limit: ${MAX_PROJECT_FILE_COUNT})`);
		}

		if (entry.fileName.endsWith("/") || isJunkEntryPath(entry.fileName)) {
			continue;
		}

		if (entry.uncompressedSize > MAX_PROJECT_FILE_BYTES) {
			throw new Error(`File is too large: ${entry.fileName}`);
		}

		totalUncompressedBytes += entry.uncompressedSize;
		if (totalUncompressedBytes > MAX_PROJECT_CONTENT_BYTES) {
			throw new Error("Zip file is too large when decompressed");
		}

		if (!getFileType(entry.fileName)) {
			throw new Error(`File type not allowed: ${entry.fileName}`);
		}

		importableFileNames.push(entry.fileName);
	}

	if (importableFileNames.length === 0) {
		throw new Error("Zip file contains no importable files");
	}

	const stripPrefix = detectCommonTopLevelFolder(importableFileNames);

	const extractionZip = await fromBufferPromise(buffer, { lazyEntries: true, autoClose: true });
	let fileCount = 0;

	for await (const entry of extractionZip.eachEntry()) {
		if (entry.fileName.endsWith("/") || isJunkEntryPath(entry.fileName)) {
			continue;
		}

		const fileId = stripPrefix ? entry.fileName.slice(stripPrefix.length) : entry.fileName;
		if (!fileId || !isValidProjectFileLocation(projectId, fileId)) {
			throw new Error(`Zip entry has an unsafe path: ${entry.fileName}`);
		}

		const entryStream = await extractionZip.openReadStreamPromise(entry);
		const data = await readEntryStreamToBuffer(entryStream);

		if (isEditableExtension(fileId)) {
			await saveDocumentContent(toDocumentName(projectId, fileId), data.toString("utf8"));
		} else {
			await saveProjectFile(projectId, fileId, new Uint8Array(data));
		}

		fileCount++;
	}

	return { fileCount };
}
