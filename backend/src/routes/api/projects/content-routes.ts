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
import { authorizeProject } from "../../../projects/access-policy.ts";
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
	isMarkdownFileId,
	isValidProjectFileLocation,
	openProjectFile,
} from "../../../projects/storage.ts";
import type { HonoVariables } from "../../../types.ts";
import {
	createFileSchema,
	createFolderSchema,
	moveFileSchema,
	renameEntrySchema,
	uploadDestinationSchema,
} from "./schemas.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/:projectId/files", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const authorization = authorizeProject(projectId, user.id, "read");
	if (!authorization.allowed) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	return c.json({ files: await listProjectContent(projectId) });
});

app.post("/:projectId/files", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const body = await c.req.json();
	const parseResult = createFileSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	return c.json({ file: await createEditableProjectFile(projectId, parseResult.data.name) });
});

app.post("/:projectId/folders", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const body = await c.req.json();
	const parseResult = createFolderSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	await createProjectFolder(projectId, parseResult.data.name);

	return c.json({ success: true });
});

app.post("/:projectId/files/upload", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

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
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "read");
	if (!authorization.allowed) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const fileId = decodeURIComponent(c.req.param("fileId"));

	if (isMarkdownFileId(fileId)) {
		return c.json({ error: "Use the collaboration endpoint for markdown files" }, 400);
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

app.patch("/:projectId/files/rename/:fileId{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

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

app.patch("/:projectId/files/:fileId{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

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

app.patch("/:projectId/folders/:folderPath{.+}/rename", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

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

app.delete("/:projectId/folders/:folderPath{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const folderPath = decodeURIComponent(c.req.param("folderPath"));
	const result = await deleteProjectContentFolder(projectId, folderPath);
	if (!result.ok) {
		return c.json({ error: "Folder not found" }, 404);
	}

	return c.json({ success: true });
});

app.delete("/:projectId/files/:fileId{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const authorization = authorizeProject(projectId, user.id, "write");
	if (!authorization.allowed && authorization.reason === "no-access") {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (!authorization.allowed) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const fileId = decodeURIComponent(c.req.param("fileId"));
	const result = await deleteProjectContentFile(projectId, fileId);
	if (!result.ok) {
		return c.json({ error: "File not found" }, 404);
	}

	return c.json({ success: true });
});

export default app;
