import { Readable } from "node:stream";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { renderMarkdownForPdf } from "../../../collab/marp-render.ts";
import { getProjectById } from "../../../db/models/project.ts";
import { renderPdfViaGotenberg } from "../../../helpers/gotenberg.ts";
import { logger } from "../../../helpers/logger.ts";
import { getProjectAuthorization } from "../../../projects/access-policy.ts";
import { createProjectZipStream, isMarkdownFileId } from "../../../projects/storage.ts";
import type { HonoVariables } from "../../../types.ts";

const app = new Hono<{ Variables: HonoVariables }>();

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

	const authorization = getProjectAuthorization(projectId, user.id, "read");
	if (!authorization.allowed) {
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

	const authorization = getProjectAuthorization(projectId, user.id, "read");
	if (!authorization.allowed) {
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

export default app;
