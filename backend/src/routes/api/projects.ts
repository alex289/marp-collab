import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import {
	createProject,
	deleteProject,
	getProjectById,
	getProjectsByOwnerId,
	updateProject,
} from "../../db/models/project.ts";
import { getUserProjectAccess } from "../../helpers/project-auth.ts";
import {
	createProjectDir,
	createProjectZipStream,
	deleteProjectFile,
	deleteProjectFolder,
	getDeckFiles,
	isMarkdownFileId,
	moveProjectFile,
	renameProjectFile,
	renameProjectFolder,
	resolveProjectFilePath,
	saveDocumentContent,
	saveProjectFile,
	toDocumentName,
} from "../../collab/files.ts";
import { stream } from "hono/streaming";
import {
	getFileType,
	getMimeType,
	isAllowedUpload,
	isEditableExtension,
} from "../../helpers/file-allowlist.ts";
import { broadcastFilesChanged } from "../../collab/project-events.ts";
import { renderMarkdownForPdf } from "../../collab/marp-render.ts";
import { renderPdfViaGotenberg } from "../../helpers/gotenberg.ts";
import { logger } from "../../helpers/logger.ts";
import z from "zod";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
	addCollaborator,
	getCollaborationsByUserId,
	getCollaborator,
	getCollaboratorsByProjectId,
	removeCollaborator,
	updateCollaborator,
} from "../../db/models/project-collaborator.ts";
import { getUserByEmail } from "../../db/models/user.ts";
import { closeProjectCollaboratorConnections } from "../../collab/connections.ts";

const app = new Hono<{ Variables: HonoVariables }>();

const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(255),
});

const updateProjectSchema = z.object({
	name: z.string().trim().min(1).max(255),
});

const addCollaboratorSchema = z.object({
	email: z.string().trim().email(),
	readOnly: z.boolean().default(false),
});

const updateCollaboratorSchema = z.object({
	readOnly: z.boolean(),
});

app.get("/", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const ownedProjects = getProjectsByOwnerId(user.id);
	const sharedProjects = getCollaborationsByUserId(user.id);

	return c.json({ projects: ownedProjects, sharedProjects: sharedProjects });
});

app.get("/:projectId/collaborators", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const collaborators = getCollaboratorsByProjectId(projectId);

	return c.json({ collaborators: collaborators });
});

app.post("/:projectId/collaborators", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	} else if (!access.isOwner) {
		return c.json({ error: "Only the project owner can manage collaborators" }, 403);
	}

	const body = await c.req.json();
	const parseResult = addCollaboratorSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	// User enumeration risk accepted: private OIDC-only deployment where all users
	// are known within the organisation.
	const userToAdd = getUserByEmail(parseResult.data.email);
	if (!userToAdd) {
		return c.json({ error: "User with that email not found" }, 404);
	}

	if (getCollaborator(projectId, userToAdd.userId)) {
		return c.json({ error: "User is already a collaborator" }, 400);
	}

	addCollaborator(projectId, userToAdd.userId, parseResult.data.readOnly);

	return c.json({ success: true });
});

app.patch("/:projectId/collaborators/:userId", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId, userId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	} else if (!access.isOwner) {
		return c.json({ error: "Only the project owner can manage collaborators" }, 403);
	}

	const body = await c.req.json();
	const parseResult = updateCollaboratorSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const collaborator = getCollaborator(projectId, userId);
	if (!collaborator) {
		return c.json({ error: "Collaborator not found" }, 404);
	}

	updateCollaborator(projectId, userId, parseResult.data.readOnly);

	// Drop open connections so the collaborator reconnects with the new access level.
	if (collaborator.readOnly !== parseResult.data.readOnly) {
		closeProjectCollaboratorConnections(projectId, userId);
	}

	return c.json({ success: true });
});

app.delete("/:projectId/collaborators/:userId", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId, userId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	} else if (!access.isOwner) {
		return c.json({ error: "Only the project owner can manage collaborators" }, 403);
	}

	removeCollaborator(projectId, userId);
	closeProjectCollaboratorConnections(projectId, userId);

	return c.json({ success: true });
});

app.post("/", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.json();
	const parseResult = createProjectSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const { name } = parseResult.data;
	const id = randomUUID();

	createProject({ id, name, ownerId: user.id });

	await saveDocumentContent(
		toDocumentName(id, "presentation.md"),
		`---\nmarp: true\n---\n\n# ${name}\n\n---\n\n## Slide 2\n`,
	);

	return c.json({ projectId: id });
});

app.get("/:projectId", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const project = getProjectById(projectId);
	if (!project) {
		return c.json({ error: "Project not found" }, 404);
	}

	return c.json({ project, isOwner: access.isOwner });
});

app.patch("/:projectId", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access || !access.isOwner) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const body = await c.req.json();
	const parseResult = updateProjectSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	updateProject({ id: projectId, name: parseResult.data.name });

	return c.json({ success: true });
});

app.delete("/:projectId", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const deleteResult = deleteProject(projectId, user.id);

	if (deleteResult.changes === 0) {
		return c.json({ error: "Project not found or you don't have permission to delete it" }, 404);
	}

	return c.json({ success: true });
});

app.get("/:projectId/export.zip", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const project = getProjectById(projectId);
	if (!project) {
		return c.json({ error: "Project not found" }, 404);
	}

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const zipStream = await createProjectZipStream(projectId);

	c.header("Content-Type", "application/zip");
	c.header(
		"Content-Disposition",
		`attachment; filename*=UTF-8''${encodeURIComponent(project.name + ".zip")}`,
	);
	c.header("Cache-Control", "no-store");

	return stream(c, async (s) => {
		s.onAbort(() => {
			zipStream.destroy();
		});
		await s.pipe(Readable.toWeb(zipStream) as ReadableStream);
	});
});

app.get("/:projectId/export/pdf/:fileId{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const projectId = c.req.param("projectId");
	const fileId = decodeURIComponent(c.req.param("fileId"));

	const project = getProjectById(projectId);
	if (!project) {
		return c.json({ error: "Project not found" }, 404);
	}

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	if (!isMarkdownFileId(fileId)) {
		return c.json({ error: "Only markdown files can be exported to PDF" }, 400);
	}

	const rendered = await renderMarkdownForPdf(projectId, fileId);
	if (!rendered) {
		return c.json({ error: "File not found" }, 404);
	}

	let gotenbergResponse: Response;
	try {
		gotenbergResponse = await renderPdfViaGotenberg(projectId, rendered);
	} catch (error) {
		logger.error(error, "Failed to reach Service for PDF export");
		return c.json({ error: "PDF export service is unavailable" }, 502);
	}

	if (!gotenbergResponse.ok || !gotenbergResponse.body) {
		logger.error(
			{ status: gotenbergResponse.status, body: await gotenbergResponse.text() },
			"PDF export failed",
		);
		return c.json({ error: "PDF export failed" }, 502);
	}

	const lastDot = fileId.lastIndexOf(".");
	const baseName = lastDot > -1 ? fileId.slice(0, lastDot) : fileId;

	c.header("Content-Type", "application/pdf");
	c.header(
		"Content-Disposition",
		`attachment; filename*=UTF-8''${encodeURIComponent(`${project.name} - ${baseName}.pdf`)}`,
	);
	c.header("Cache-Control", "no-store");

	return stream(c, async (s) => {
		s.onAbort(() => {
			void gotenbergResponse.body?.cancel();
		});
		await s.pipe(gotenbergResponse.body as ReadableStream);
	});
});

app.get("/:projectId/files", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();

	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const deckFiles = await getDeckFiles(projectId);

	return c.json({
		files: deckFiles.map((file) => ({
			...file,
			...(file.type === "markdown" ? { documentName: toDocumentName(projectId, file.id) } : {}),
		})),
	});
});

const createFileSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(
			/^[\w\-. /]+\.(md|markdown|css)$/,
			"File name must end in .md, .markdown, or .css and contain only letters, numbers, spaces, hyphens, underscores, dots, or slashes",
		)
		.refine((name) => !name.split("/").includes(".."), "Path traversal not allowed")
		.refine((name) => !name.startsWith("/"), "Absolute paths not allowed"),
});

app.post("/:projectId/files", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const body = await c.req.json();
	const parseResult = createFileSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const { name } = parseResult.data;
	const documentName = toDocumentName(projectId, name);
	await saveDocumentContent(documentName, `\n`);
	broadcastFilesChanged(projectId);

	return c.json({
		file: {
			id: name,
			label: name,
			type: "markdown",
			documentName,
		},
	});
});

const createFolderSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(
			/^[\w\-. /]+$/,
			"Folder name must contain only letters, numbers, spaces, hyphens, underscores, dots, or slashes",
		)
		.refine((name) => !name.split("/").includes(".."), "Path traversal not allowed")
		.refine((name) => !name.startsWith("/"), "Absolute paths not allowed"),
});

const renameEntrySchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(
			/^[\w\-. ]+$/,
			"Name must contain only letters, numbers, spaces, hyphens, underscores, or dots",
		)
		.refine((name) => !name.includes("/"), "Slashes are not allowed when renaming")
		.refine((name) => !name.includes("\\"), "Backslashes are not allowed when renaming")
		.refine((name) => !name.includes(".."), "Path traversal not allowed"),
});

const uploadDestinationSchema = z
	.string()
	.max(255)
	.regex(
		/^[\w\-. /]*$/,
		"Upload destination must contain only letters, numbers, spaces, hyphens, underscores, dots, or slashes",
	)
	.refine((destination) => !destination.split("/").includes(".."), "Path traversal not allowed")
	.refine((destination) => !destination.startsWith("/"), "Absolute paths not allowed");
app.post("/:projectId/folders", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const body = await c.req.json();
	const parseResult = createFolderSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	await createProjectDir(projectId, parseResult.data.name);
	broadcastFilesChanged(projectId);

	return c.json({ success: true });
});

app.post("/:projectId/files/upload", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
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
	if (!resolveProjectFilePath(projectId, fileId)) {
		return c.json({ error: "Invalid upload destination" }, 400);
	}

	if (isEditable) {
		const content = await uploadedFile.text();
		const documentName = toDocumentName(projectId, fileId);
		await saveDocumentContent(documentName, content);
		broadcastFilesChanged(projectId);
		return c.json({
			file: {
				id: fileId,
				label: fileId,
				type: "markdown",
				documentName,
			},
		});
	}

	const data = new Uint8Array(await uploadedFile.arrayBuffer());
	await saveProjectFile(projectId, fileId, data);
	broadcastFilesChanged(projectId);

	return c.json({
		file: {
			id: fileId,
			label: fileId,
			type: getFileType(fileId) ?? "asset",
		},
	});
});

app.get("/:projectId/files/:fileId{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const fileId = decodeURIComponent(c.req.param("fileId"));

	if (isMarkdownFileId(fileId)) {
		return c.json({ error: "Use the collaboration endpoint for markdown files" }, 400);
	}

	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return c.json({ error: "File not found" }, 404);
	}

	try {
		await stat(filePath);
	} catch {
		return c.json({ error: "File not found" }, 404);
	}

	c.header("Content-Type", getMimeType(fileId));
	c.header("Content-Disposition", "attachment");
	c.header("Cache-Control", "no-cache");

	return stream(c, async (s) => {
		const readStream = createReadStream(filePath);
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
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const fileId = decodeURIComponent(c.req.param("fileId"));
	const body = await c.req.json();
	const parseResult = renameEntrySchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const newFileId = await renameProjectFile(projectId, fileId, parseResult.data.name);
	if (!newFileId) {
		return c.json({ error: "File not found, invalid name, or destination already exists" }, 404);
	}

	broadcastFilesChanged(projectId);
	return c.json({ newFileId });
});

const moveFileSchema = z.object({
	destination: z
		.string()
		.max(255)
		.refine((d) => !d.split("/").includes(".."), "Path traversal not allowed")
		.refine((d) => !d.startsWith("/"), "Absolute paths not allowed"),
});

app.patch("/:projectId/files/:fileId{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const fileId = decodeURIComponent(c.req.param("fileId"));
	const body = await c.req.json();
	const parseResult = moveFileSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const { destination } = parseResult.data;
	const newFileId = await moveProjectFile(projectId, fileId, destination);
	if (!newFileId) {
		return c.json({ error: "File not found or invalid destination" }, 404);
	}

	broadcastFilesChanged(projectId);
	return c.json({ newFileId });
});

app.patch("/:projectId/folders/:folderPath{.+}/rename", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const folderPath = decodeURIComponent(c.req.param("folderPath"));
	const body = await c.req.json();
	const parseResult = renameEntrySchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const newFolderPath = await renameProjectFolder(projectId, folderPath, parseResult.data.name);
	if (!newFolderPath) {
		return c.json({ error: "Folder not found, invalid name, or destination already exists" }, 404);
	}

	broadcastFilesChanged(projectId);
	return c.json({ newFolderPath });
});

app.delete("/:projectId/folders/:folderPath{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const folderPath = decodeURIComponent(c.req.param("folderPath"));
	const deleted = await deleteProjectFolder(projectId, folderPath);

	if (!deleted) {
		return c.json({ error: "Folder not found" }, 404);
	}

	broadcastFilesChanged(projectId);
	return c.json({ success: true });
});

app.delete("/:projectId/files/:fileId{.+}", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const { projectId } = c.req.param();
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}
	if (access.readOnly) {
		return c.json({ error: "You do not have write access to this project" }, 403);
	}

	const fileId = decodeURIComponent(c.req.param("fileId"));
	const deleted = await deleteProjectFile(projectId, fileId);

	if (!deleted) {
		return c.json({ error: "File not found" }, 404);
	}

	broadcastFilesChanged(projectId);
	return c.json({ success: true });
});

export default app;
