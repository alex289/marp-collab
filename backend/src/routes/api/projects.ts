import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import { createProject, deleteProject, getProjectsByOwnerId } from "../../db/models/project.ts";
import { getUserProjectAccess } from "../../helpers/project-auth.ts";
import {
	createProjectDir,
	createProjectZip,
	deleteProjectFile,
	deleteProjectFolder,
	getDeckFiles,
	getProjectFile,
	isMarkdownFileId,
	moveProjectFile,
	saveDocumentContent,
	saveProjectFile,
	toDocumentName,
} from "../../collab/files.ts";
import {
	getFileType,
	getMimeType,
	isAllowedUpload,
	isEditableExtension,
} from "../../helpers/file-allowlist.ts";
import { broadcastFilesChanged } from "../../collab/project-events.ts";
import z from "zod";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";

const app = new Hono<{ Variables: HonoVariables }>();

const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(255),
});

app.get("/", (c) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const ownedProjects = getProjectsByOwnerId(user.id);
	// To-Do: Project sharing

	return c.json({ projects: ownedProjects, sharedProjects: [] });
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
	const access = getUserProjectAccess(projectId, user.id);
	if (!access) {
		return c.json({ error: "Project not found or access denied" }, 403);
	}

	const zip = await createProjectZip(projectId);

	return new Response(new Uint8Array(zip), {
		status: 200,
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="project-${projectId}.zip"`,
			"Content-Length": zip.length.toString(),
			"Cache-Control": "no-store",
		},
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
			{ error: "File type not allowed. Only images, CSS, Markdown, and font files are permitted." },
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

	if (isEditable) {
		const content = await uploadedFile.text();
		const documentName = toDocumentName(projectId, sanitized);
		await saveDocumentContent(documentName, content);
		broadcastFilesChanged(projectId);
		return c.json({
			file: {
				id: sanitized,
				label: sanitized,
				type: "markdown",
				documentName,
			},
		});
	}

	const data = new Uint8Array(await uploadedFile.arrayBuffer());
	await saveProjectFile(projectId, sanitized, data);
	broadcastFilesChanged(projectId);

	return c.json({
		file: {
			id: sanitized,
			label: sanitized,
			type: getFileType(sanitized) ?? "asset",
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

	const data = await getProjectFile(projectId, fileId);
	if (!data) {
		return c.json({ error: "File not found" }, 404);
	}

	return new Response(new Uint8Array(data), {
		status: 200,
		headers: {
			"Content-Type": getMimeType(fileId),
			"Cache-Control": "private, max-age=3600",
		},
	});
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
