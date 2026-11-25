import { Hono } from "hono";
import z from "zod";
import {
	requireProjectWriteAccess,
	type ProjectRouteVariables,
} from "../../../middleware/project-access-middleware.ts";
import {
	MAX_REPLACEMENT_LENGTH,
	MAX_SEARCH_QUERY_LENGTH,
	ProjectSearchError,
	replaceAllProjectMatches,
	replaceProjectMatch,
	searchProjectFiles,
} from "../../../projects/project-search.ts";

const app = new Hono<{ Variables: ProjectRouteVariables }>();

const searchSchema = z.object({
	query: z.string().min(1).max(MAX_SEARCH_QUERY_LENGTH),
	caseSensitive: z.boolean().default(false),
});

const replaceOneSchema = z.object({
	mode: z.literal("one"),
	fileId: z.string().min(1).max(500),
	match: z.object({
		startOffset: z.number().int().min(0),
		endOffset: z.number().int().min(1),
		matchedText: z.string().min(1).max(MAX_SEARCH_QUERY_LENGTH),
	}),
	replacement: z.string().max(MAX_REPLACEMENT_LENGTH),
});

const replaceAllSchema = z.object({
	mode: z.literal("all"),
	query: z.string().min(1).max(MAX_SEARCH_QUERY_LENGTH),
	replacement: z.string().max(MAX_REPLACEMENT_LENGTH),
	caseSensitive: z.boolean().default(false),
	fileId: z.string().min(1).max(500).optional(),
});

const replaceSchema = z.discriminatedUnion("mode", [replaceOneSchema, replaceAllSchema]);

app.post("/:projectId/search", async (c) => {
	const { projectId } = c.req.param();
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const parseResult = searchSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	const result = await searchProjectFiles(projectId, parseResult.data.query, {
		caseSensitive: parseResult.data.caseSensitive,
	});
	return c.json(result);
});

app.post("/:projectId/search/replace", requireProjectWriteAccess, async (c) => {
	const { projectId } = c.req.param();
	const user = c.get("user")!;
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const parseResult = replaceSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json({ error: z.prettifyError(parseResult.error) }, 400);
	}

	try {
		if (parseResult.data.mode === "one") {
			const result = await replaceProjectMatch(projectId, user.id, {
				fileId: parseResult.data.fileId,
				match: parseResult.data.match,
				replacement: parseResult.data.replacement,
			});
			return c.json(result);
		}

		const result = await replaceAllProjectMatches(projectId, user.id, {
			query: parseResult.data.query,
			replacement: parseResult.data.replacement,
			caseSensitive: parseResult.data.caseSensitive,
			fileId: parseResult.data.fileId,
		});
		return c.json(result);
	} catch (error) {
		if (error instanceof ProjectSearchError) {
			return c.json({ error: error.message }, error.status);
		}
		throw error;
	}
});

export default app;
