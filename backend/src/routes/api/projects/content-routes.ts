import { extname } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import z from "zod";
import {
	getMimeType,
	isAllowedUpload,
	isEditableExtension,
} from "../../../helpers/file-allowlist.ts";
import {
	createEditableProjectFile,
	createProjectFolder,
	deleteProjectContentFile,
	deleteProjectContentFolder,
	listProjectContent,
	moveProjectContentFile,
	renameProjectContentFile,
	renameProjectContentFolder,
	saveBinaryProjectFile,
	saveEditableProjectFile,
} from "../../../projects/project-content.ts";
import {
	getDocumentContent,
	isMarkdownFileId,
	isValidProjectFileLocation,
	openProjectFile,
} from "../../../projects/storage.ts";
import { toDocumentName } from "../../../projects/document-identity.ts";
import { collabServer } from "../../../collab/hocuspocus.ts";
import {
	requireProjectWriteAccess,
	type ProjectRouteVariables,
} from "./project-access-middleware.ts";
import {
	createFileSchema,
	createFolderSchema,
	moveFileSchema,
	renameEntrySchema,
	uploadDestinationSchema,
} from "./schemas.ts";

const app = new Hono<{ Variables: ProjectRouteVariables }>();

app.get("/:projectId/files", async (c) => {
	const { projectId } = c.req.param();
	return c.json({ files: await listProjectContent(projectId) });
});

app.post("/:projectId/files", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const body = await c.req.json();
	const parseResult = createFileSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	return c.json({ file: await createEditableProjectFile(projectId, parseResult.data.name) });
});

app.post("/:projectId/folders", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const body = await c.req.json();
	const parseResult = createFolderSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	await createProjectFolder(projectId, parseResult.data.name);

	return c.json({ success: true });
});

app.post("/:projectId/files/upload", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const body = await c.req.parseBody();
	const uploadedFile = body["file"];
	if (!(uploadedFile instanceof File)) {
		return c.json({ error: "No file provided" }, 400);
	}

	const isEditable = isEditableExtension(uploadedFile.name);
	if (!isAllowedUpload(uploadedFile.name, uploadedFile.type)) {
		return c.json(
			{
				error:
					"File type not allowed. Only images, videos, CSS, Markdown, and font files are permitted.",
			},
			400,
		);
	}

	const ext = extname(uploadedFile.name).toLowerCase();
	const sanitized =
		uploadedFile.name
			.slice(0, uploadedFile.name.length - ext.length)
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9._-]/g, "")
			.slice(0, 200) + ext;

	if (!sanitized || sanitized === ext) {
		return c.json({ error: "Invalid file name" }, 400);
	}

	const destination =
		typeof body["destination"] === "string"
			? body["destination"]
					.trim()
					.replace(/\\/g, "/")
					.replace(/^\/+|\/+$/g, "")
			: "";
	const destinationParseResult = uploadDestinationSchema.safeParse(destination);
	if (!destinationParseResult.success) {
		return c.json({ error: "Invalid upload destination" }, 400);
	}

	const fileId = destination ? `${destination}/${sanitized}` : sanitized;
	if (!isValidProjectFileLocation(projectId, fileId)) {
		return c.json({ error: "Invalid upload destination" }, 400);
	}

	if (isEditable) {
		const content = await uploadedFile.text();
		return c.json({ file: await saveEditableProjectFile(projectId, fileId, content) });
	}

	const data = new Uint8Array(await uploadedFile.arrayBuffer());
	return c.json({ file: await saveBinaryProjectFile(projectId, fileId, data) });
});

app.get("/:projectId/files/:fileId{.+}", async (c) => {
	const { projectId } = c.req.param();

	const fileId = decodeURIComponent(c.req.param("fileId"));

	if (isMarkdownFileId(fileId)) {
		// Markdown is edited via the collab endpoint; serve reads from the live
		// Yjs document when one is loaded so includes/previews see current content.
		const documentName = toDocumentName(projectId, fileId);
		const liveDocument = collabServer.documents.get(documentName);
		if (liveDocument) {
			return c.text(liveDocument.getText("content").toJSON());
		}

		const content = await getDocumentContent(documentName);
		if (content === undefined) {
			return c.json({ error: "File not found" }, 404);
		}
		return c.text(content);
	}

	const readStream = await openProjectFile(projectId, fileId);
	if (!readStream) {
		return c.json({ error: "File not found" }, 404);
	}

	c.header("Content-Type", getMimeType(fileId));
	c.header("Content-Disposition", "attachment");
	c.header("Cache-Control", "no-cache");

	return stream(c, async (s) => {
		s.onAbort(() => {
			readStream.destroy();
		});
		await s.pipe(Readable.toWeb(readStream) as ReadableStream);
	});
});

app.patch("/:projectId/files/rename/:fileId{.+}", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const fileId = decodeURIComponent(c.req.param("fileId"));
	const body = await c.req.json();
	const parseResult = renameEntrySchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const result = await renameProjectContentFile(projectId, fileId, parseResult.data.name);
	if (!result.ok) {
		return c.json({ error: "File not found, invalid name, or destination already exists" }, 404);
	}

	return c.json({ newFileId: result.id });
});

app.patch("/:projectId/files/:fileId{.+}", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const fileId = decodeURIComponent(c.req.param("fileId"));
	const body = await c.req.json();
	const parseResult = moveFileSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const { destination } = parseResult.data;
	const result = await moveProjectContentFile(projectId, fileId, destination);
	if (!result.ok) {
		return c.json({ error: "File not found or invalid destination" }, 404);
	}

	return c.json({ newFileId: result.id });
});

app.patch("/:projectId/folders/:folderPath{.+}/rename", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const folderPath = decodeURIComponent(c.req.param("folderPath"));
	const body = await c.req.json();
	const parseResult = renameEntrySchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const result = await renameProjectContentFolder(projectId, folderPath, parseResult.data.name);
	if (!result.ok) {
		return c.json({ error: "Folder not found, invalid name, or destination already exists" }, 404);
	}

	return c.json({ newFolderPath: result.id });
});

app.delete("/:projectId/folders/:folderPath{.+}", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const folderPath = decodeURIComponent(c.req.param("folderPath"));
	const result = await deleteProjectContentFolder(projectId, folderPath);
	if (!result.ok) {
		return c.json({ error: "Folder not found" }, 404);
	}

	return c.json({ success: true });
});

app.delete("/:projectId/files/:fileId{.+}", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();

	const fileId = decodeURIComponent(c.req.param("fileId"));
	const result = await deleteProjectContentFile(projectId, fileId);
	if (!result.ok) {
		return c.json({ error: "File not found" }, 404);
	}

	return c.json({ success: true });
});

export default app;
