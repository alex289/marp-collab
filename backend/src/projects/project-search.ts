import { collabServer } from "../collab/hocuspocus.ts";
import { getCollabDocumentContent } from "../collab/document-content.ts";
import { flushProjectFileDocument } from "../collab/project-events.ts";
import { isEditableExtension } from "../helpers/file-allowlist.ts";
import { DOCUMENT_STATE_SUFFIX } from "./document-state-path.ts";
import { listProjectContent } from "./project-content.ts";
import { beginProjectWrite, withProjectContentMutation } from "./project-operations.ts";
import { documentFileExists, getProjectFileSize, isValidProjectFileLocation } from "./storage.ts";
import {
	DOCUMENT_CONTENT_KEY,
	PROJECT_PRESENCE_DOCUMENT_ID,
	toDocumentName,
} from "../../../shared/collaboration.ts";
import {
	findTextMatches,
	isCurrentTextMatch,
	type TextSearchMatch,
} from "../../../shared/text-search.ts";

export const MAX_SEARCH_QUERY_LENGTH = 500;
export const MAX_REPLACEMENT_LENGTH = 10_000;
const MAX_SEARCH_FILE_CHARACTERS = 1_000_000;
const MAX_SEARCH_SCAN_CHARACTERS = 8_000_000;
export const MAX_TOTAL_SEARCH_MATCHES = 500;
const MAX_MATCHES_PER_FILE = 100;

export class ProjectSearchError extends Error {
	status: 400 | 403 | 404 | 409;

	constructor(message: string, status: 400 | 403 | 404 | 409) {
		super(message);
		this.name = "ProjectSearchError";
		this.status = status;
	}
}

export type ProjectSearchFileResult = {
	fileId: string;
	matches: TextSearchMatch[];
};

export type ProjectSearchResult = {
	query: string;
	caseSensitive: boolean;
	files: ProjectSearchFileResult[];
	totalMatches: number;
	truncated: boolean;
	skippedFiles: string[];
};

function assertValidEditableFileId(projectId: string, fileId: string): void {
	const segments = fileId.split("/");
	const hasUnsafeSegment =
		fileId.includes("\\") ||
		segments.some(
			(segment) =>
				segment.length === 0 ||
				segment.startsWith(".") ||
				segment.toLowerCase().endsWith(DOCUMENT_STATE_SUFFIX),
		) ||
		segments[0] === PROJECT_PRESENCE_DOCUMENT_ID;

	if (
		hasUnsafeSegment ||
		!isValidProjectFileLocation(projectId, fileId) ||
		!isEditableExtension(fileId)
	) {
		throw new ProjectSearchError("Invalid editable file path.", 400);
	}
}

async function listEditableProjectFileIds(projectId: string): Promise<string[]> {
	const entries = await listProjectContent(projectId);
	return entries
		.filter((entry) => entry.type !== "folder" && isEditableExtension(entry.id))
		.map((entry) => entry.id)
		.sort((left, right) => left.localeCompare(right));
}

async function readSearchableFileContent(
	projectId: string,
	fileId: string,
	remainingBudget: number,
): Promise<{ content: string; skipped: false } | { content: undefined; skipped: boolean }> {
	const documentName = toDocumentName(projectId, fileId);
	if (!collabServer.documents.has(documentName)) {
		const size = await getProjectFileSize(projectId, fileId);
		if (size === undefined) {
			return { content: undefined, skipped: false };
		}
		if (size > MAX_SEARCH_FILE_CHARACTERS * 4) {
			return { content: undefined, skipped: true };
		}
	}

	const content = await getCollabDocumentContent(documentName);
	if (content === undefined) {
		return { content: undefined, skipped: false };
	}
	if (content.length > MAX_SEARCH_FILE_CHARACTERS || content.length > remainingBudget) {
		return { content: undefined, skipped: true };
	}
	return { content, skipped: false };
}

export async function searchProjectFiles(
	projectId: string,
	query: string,
	options: { caseSensitive?: boolean } = {},
): Promise<ProjectSearchResult> {
	const caseSensitive = options.caseSensitive ?? false;
	if (query.length === 0) {
		return {
			query,
			caseSensitive,
			files: [],
			totalMatches: 0,
			truncated: false,
			skippedFiles: [],
		};
	}

	const fileIds = await listEditableProjectFileIds(projectId);
	const files: ProjectSearchFileResult[] = [];
	const skippedFiles: string[] = [];
	let scannedChars = 0;
	let totalMatches = 0;
	let truncated = false;

	for (const fileId of fileIds) {
		const remainingMatches = MAX_TOTAL_SEARCH_MATCHES - totalMatches;
		if (remainingMatches <= 0) {
			truncated = true;
			break;
		}

		const loaded = await readSearchableFileContent(
			projectId,
			fileId,
			MAX_SEARCH_SCAN_CHARACTERS - scannedChars,
		);
		if (loaded.skipped) {
			skippedFiles.push(fileId);
			continue;
		}
		if (loaded.content === undefined) {
			continue;
		}
		scannedChars += loaded.content.length;

		const fileLimit = Math.min(MAX_MATCHES_PER_FILE, remainingMatches);
		const found = findTextMatches(loaded.content, query, {
			caseSensitive,
			maxMatches: fileLimit + 1,
		});
		if (found.length === 0) {
			continue;
		}
		if (found.length > fileLimit) {
			truncated = true;
			found.length = fileLimit;
		}

		files.push({ fileId, matches: found });
		totalMatches += found.length;
	}

	return { query, caseSensitive, files, totalMatches, truncated, skippedFiles };
}

async function withSearchWriteLock<Result>(
	projectId: string,
	action: () => Promise<Result>,
): Promise<Result> {
	const release = beginProjectWrite(projectId);
	if (!release) {
		throw new ProjectSearchError(
			"Project is syncing with Git. Try again after synchronization.",
			409,
		);
	}
	try {
		return await withProjectContentMutation(projectId, action);
	} finally {
		release();
	}
}

export async function replaceProjectMatch(
	projectId: string,
	userId: string,
	input: {
		fileId: string;
		match: Pick<TextSearchMatch, "startOffset" | "endOffset" | "matchedText">;
		replacement: string;
		verifyWriteAccess?: () => void;
	},
): Promise<{ fileId: string; replacedMatches: number }> {
	assertValidEditableFileId(projectId, input.fileId);

	return await withSearchWriteLock(projectId, async () => {
		input.verifyWriteAccess?.();
		const documentName = toDocumentName(projectId, input.fileId);
		if (!(await documentFileExists(documentName))) {
			throw new ProjectSearchError("File not found.", 404);
		}

		const connection = await collabServer.openDirectConnection(documentName, { userId });
		try {
			await connection.transact((document) => {
				input.verifyWriteAccess?.();
				const text = document.getText(DOCUMENT_CONTENT_KEY);
				const current = text.toJSON();
				if (!isCurrentTextMatch(current, input.match)) {
					throw new ProjectSearchError("Result changed. Search again.", 409);
				}

				const matchLength = input.match.endOffset - input.match.startOffset;
				const nextLength = current.length - matchLength + input.replacement.length;
				if (nextLength > MAX_SEARCH_FILE_CHARACTERS) {
					throw new ProjectSearchError("Replacement would exceed the maximum file size.", 400);
				}

				text.delete(input.match.startOffset, matchLength);
				text.insert(input.match.startOffset, input.replacement);
			});

			if (!(await documentFileExists(documentName))) {
				throw new ProjectSearchError("File was renamed, moved or deleted during replacement.", 409);
			}
			await flushProjectFileDocument(projectId, input.fileId);
		} finally {
			await connection.disconnect();
		}

		return { fileId: input.fileId, replacedMatches: 1 };
	});
}

export async function replaceAllProjectMatches(
	projectId: string,
	userId: string,
	input: {
		query: string;
		replacement: string;
		caseSensitive?: boolean;
		fileId?: string;
		verifyWriteAccess?: () => void;
	},
): Promise<{ replacedMatches: number; updatedFiles: string[] }> {
	const caseSensitive = input.caseSensitive ?? false;
	if (input.fileId !== undefined) {
		assertValidEditableFileId(projectId, input.fileId);
	}

	return await withSearchWriteLock(projectId, async () => {
		input.verifyWriteAccess?.();
		const targetFileIds =
			input.fileId !== undefined ? [input.fileId] : await listEditableProjectFileIds(projectId);

		if (input.fileId !== undefined) {
			const documentName = toDocumentName(projectId, input.fileId);
			if (!(await documentFileExists(documentName))) {
				throw new ProjectSearchError("File not found.", 404);
			}
		}

		let replacedMatches = 0;
		const updatedFiles: string[] = [];

		for (const fileId of targetFileIds) {
			input.verifyWriteAccess?.();
			const documentName = toDocumentName(projectId, fileId);
			const previewContent = await getCollabDocumentContent(documentName);
			if (previewContent === undefined || previewContent.length > MAX_SEARCH_FILE_CHARACTERS) {
				continue;
			}
			if (
				findTextMatches(previewContent, input.query, { caseSensitive, maxMatches: 1 }).length === 0
			) {
				continue;
			}
			if (!(await documentFileExists(documentName))) {
				continue;
			}

			let fileReplacements = 0;
			const connection = await collabServer.openDirectConnection(documentName, { userId });
			try {
				await connection.transact((document) => {
					input.verifyWriteAccess?.();
					const text = document.getText(DOCUMENT_CONTENT_KEY);
					const current = text.toJSON();
					const matches = findTextMatches(current, input.query, { caseSensitive });
					if (matches.length === 0) {
						return;
					}

					const removedChars = matches.reduce(
						(sum, match) => sum + (match.endOffset - match.startOffset),
						0,
					);
					const nextLength =
						current.length - removedChars + matches.length * input.replacement.length;
					if (nextLength > MAX_SEARCH_FILE_CHARACTERS) {
						throw new ProjectSearchError(
							`Replacement in ${fileId} would exceed the maximum file size.`,
							400,
						);
					}

					for (let index = matches.length - 1; index >= 0; index -= 1) {
						const match = matches[index]!;
						text.delete(match.startOffset, match.endOffset - match.startOffset);
						text.insert(match.startOffset, input.replacement);
					}
					fileReplacements = matches.length;
				});

				if (fileReplacements > 0 && (await documentFileExists(documentName))) {
					await flushProjectFileDocument(projectId, fileId);
					replacedMatches += fileReplacements;
					updatedFiles.push(fileId);
				}
			} finally {
				await connection.disconnect();
			}
		}

		return { replacedMatches, updatedFiles };
	});
}
