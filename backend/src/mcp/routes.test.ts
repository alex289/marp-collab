import { after, before, test } from "node:test";
import { deepEqual, equal, match, ok, rejects } from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import * as Y from "yjs";
import git from "isomorphic-git";

let tempDir: string;
let origin: string;
let server: ServerType;
let app: Hono;
let db: typeof import("../db/db.ts").db;
let auth: typeof import("../auth.ts").auth;
let storage: typeof import("../projects/storage.ts");
let collab: typeof import("../collab/hocuspocus.ts").collabServer;
let cookie: string;
let accessToken: string;
let readToken: string;
let clientId: string;
const secret = "mcp-integration-tests-secret-at-least-32-characters";
const verifier = "mcp-test-code-verifier-with-at-least-forty-three-characters";

before(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "marp-mcp-"));
	app = new Hono();
	server = serve({ fetch: (request) => app.fetch(request), port: 0, hostname: "127.0.0.1" });
	if (!server.listening) {
		await new Promise<void>((resolve) => server.once("listening", resolve));
	}
	const address = server.address();
	ok(address && typeof address !== "string");
	origin = `http://127.0.0.1:${address.port}`;
	process.env.URL = origin;
	process.env.PORT = String(address.port);
	process.env.HOSTNAME = "127.0.0.1";
	process.env.DATA_PATH = tempDir;
	process.env.AUTH_SECRET = secret;
	process.env.MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION = "true";
	process.env.AUTH_RATE_LIMIT_ENABLED = "false";
	({ auth } = await import("../auth.ts"));
	({ db } = await import("../db/db.ts"));
	storage = await import("../projects/storage.ts");
	({ collabServer: collab } = await import("../collab/hocuspocus.ts"));
	const { mcpRouter, mcpConsentRouter } = await import("./routes.ts");
	app.route("/", mcpRouter);
	app.route("/api/v1/mcp", mcpConsentRouter);
	app.on(["GET", "POST"], "/api/v1/auth/*", (c) => auth.handler(c.req.raw));
	const now = new Date().toISOString();
	for (const id of ["owner", "reader", "outsider"]) {
		db.prepare(
			"insert into user (id,name,email,emailVerified,createdAt,updatedAt) values (?,?,?,1,?,?)",
		).run(id, id, `${id}@example.com`, now, now);
	}
	db.prepare(
		"insert into project (id,name,ownerId,createdAt,updatedAt) values ('training','Training','owner',?,?)",
	).run(now, now);
	db.prepare(
		"insert into project_collaborator (projectId,userId,readOnly,createdAt) values ('training','reader',1,?)",
	).run(now);
	const context = await auth.$context;
	const session = await context.internalAdapter.createSession("owner");
	const signature = createHmac("sha256", secret).update(session.token).digest("base64");
	cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
	const registration = await fetch(`${origin}/api/v1/auth/oauth2/register`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_name: "Test assistant",
			redirect_uris: ["http://127.0.0.1:9876/callback"],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: "presentations:read presentations:write offline_access",
		}),
	});
	equal(registration.status, 201, await registration.clone().text());
	({ client_id: clientId } = await registration.json());
});

after(async () => {
	for (const document of collab?.documents.values() ?? []) {
		document.destroy();
	}
	collab?.documents.clear();
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	db?.close();
	await rm(tempDir, { recursive: true, force: true });
	for (const name of [
		"URL",
		"PORT",
		"HOSTNAME",
		"DATA_PATH",
		"AUTH_SECRET",
		"MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION",
		"AUTH_RATE_LIMIT_ENABLED",
	]) {
		delete process.env[name];
	}
});

async function authorize(scope: string, accept = true) {
	const query = new URLSearchParams({
		client_id: clientId,
		redirect_uri: "http://127.0.0.1:9876/callback",
		response_type: "code",
		scope,
		resource: `${origin}/mcp`,
		code_challenge: createHash("sha256").update(verifier).digest("base64url"),
		code_challenge_method: "S256",
		state: "test-state",
		prompt: "consent",
	});
	const response = await fetch(`${origin}/api/v1/auth/oauth2/authorize?${query}`, {
		headers: { cookie, accept: "application/json" },
		redirect: "manual",
	});
	equal(response.status, 200, await response.clone().text());
	const consentUrl = new URL((await response.json()).url, origin);
	equal(consentUrl.pathname, "/consent");
	const detailsResponse = await fetch(`${origin}/api/v1/mcp/consent${consentUrl.search}`, {
		headers: { cookie },
	});
	equal(detailsResponse.status, 200, await detailsResponse.clone().text());
	const details = await detailsResponse.json();
	equal(details.name, "Test assistant");
	equal(details.redirectHost, "127.0.0.1:9876");
	const consent = await fetch(`${origin}/api/v1/auth/oauth2/consent`, {
		method: "POST",
		headers: { cookie, origin, "content-type": "application/json" },
		body: JSON.stringify({ accept, oauth_query: details.oauthQuery }),
	});
	equal(consent.status, 200, await consent.clone().text());
	const { url } = await consent.json();
	return new URL(url);
}

async function tokenFor(scope: string) {
	const callback = await authorize(scope);
	const token = await fetch(`${origin}/api/v1/auth/oauth2/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: callback.searchParams.get("code")!,
			code_verifier: verifier,
			client_id: clientId,
			redirect_uri: "http://127.0.0.1:9876/callback",
			resource: `${origin}/mcp`,
		}),
	});
	equal(token.status, 200, await token.clone().text());
	return token.json();
}

function rpc(method: string, params: Record<string, unknown> = {}, token = accessToken) {
	return fetch(`${origin}/mcp`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2025-11-25",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
}

async function call(name: string, args: Record<string, unknown>, token = accessToken) {
	const response = await rpc("tools/call", { name, arguments: args }, token);
	equal(response.status, 200, await response.clone().text());
	const text = await response.text();
	const message = text.startsWith("event:")
		? JSON.parse(text.split("data: ")[1].split("\n")[0])
		: JSON.parse(text);
	return message.result;
}

test("publishes public discovery and challenges unauthenticated MCP calls", async () => {
	const metadata = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);
	equal(metadata.status, 200, await metadata.clone().text());
	equal((await metadata.json()).resource, `${origin}/mcp`);
	const issuer = await fetch(`${origin}/.well-known/oauth-authorization-server/api/v1/auth`);
	equal(issuer.status, 200, await issuer.clone().text());
	const config = await issuer.json();
	equal(config.client_id_metadata_document_supported, true);
	ok(config.registration_endpoint);
	for (const headers of [{}, { authorization: "Bearer invalid" }, { cookie }] as Record<
		string,
		string
	>[]) {
		const response = await fetch(`${origin}/mcp`, { method: "POST", headers });
		equal(response.status, 401);
		match(response.headers.get("www-authenticate")!, /resource_metadata=/);
		match(response.headers.get("www-authenticate")!, /presentations:read presentations:write/);
	}
	equal((await fetch(`${origin}/mcp`)).status, 405);
});

test("completes consent and PKCE to obtain read/write and read-only MCP tokens", async () => {
	const granted = await tokenFor("presentations:read presentations:write offline_access");
	ok(granted.refresh_token);
	accessToken = granted.access_token;
	readToken = (await tokenFor("presentations:read")).access_token;
	ok(accessToken);
	ok(readToken);
});

test("denies consent and rejects missing or tampered consent queries", async () => {
	const callback = await authorize("presentations:read", false);
	equal(callback.searchParams.get("error"), "access_denied");
	for (const query of ["", "?client_id=forged&scope=presentations:write&sig=forged"]) {
		equal(
			(await fetch(`${origin}/api/v1/mcp/consent${query}`, { headers: { cookie } })).status,
			400,
		);
	}
});

test("supports the current stateless MCP envelope", async () => {
	const { PROTOCOL_VERSION_META_KEY, CLIENT_INFO_META_KEY, CLIENT_CAPABILITIES_META_KEY } =
		await import("@modelcontextprotocol/server");
	const response = await fetch(`${origin}/mcp`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${accessToken}`,
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2026-07-28",
			"Mcp-Method": "tools/list",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
			params: {
				_meta: {
					[PROTOCOL_VERSION_META_KEY]: "2026-07-28",
					[CLIENT_INFO_META_KEY]: { name: "test-client", version: "1.0.0" },
					[CLIENT_CAPABILITIES_META_KEY]: {},
				},
			},
		}),
	});
	equal(response.status, 200, await response.clone().text());
	match(await response.text(), /create_presentation/);
});

test("rejects JWTs intended for browser sessions", async () => {
	const { token } = await auth.api.signJWT({
		body: {
			payload: {
				sub: "owner",
				aud: `${origin}/mcp`,
				scope: "presentations:read presentations:write",
			},
		},
	});
	equal((await rpc("tools/list", {}, token)).status, 401);
});

test("lists only permitted projects and enforces OAuth write scopes", async () => {
	const listed = await call("list_projects", {}, readToken);
	deepEqual(listed.structuredContent.projects, [
		{ id: "training", name: "Training", readOnly: false },
	]);
	const { WRITE_TOOL_NAMES } = await import("./server.ts");
	const readTools = await rpc("tools/list", {}, readToken);
	const toolList = await readTools.text();
	match(toolList, /check_references/);
	match(toolList, /preview_presentation/);
	for (const name of Object.values(WRITE_TOOL_NAMES)) {
		ok(!toolList.includes(`"${name}"`));
		const denied = await rpc(
			"tools/call",
			{
				name,
				arguments: { projectId: "training", fileId: "denied.md", content: "# No" },
				_meta: { progressToken: "scope-check" },
			},
			readToken,
		);
		equal(denied.status, 403);
		match(denied.headers.get("www-authenticate")!, /presentations:write/);
	}
});

test("creates, reads and edits decks without overwriting existing files", async () => {
	const args = {
		projectId: "training",
		fileId: "chapters/deck.md",
		content: "---\nmarp: true\n---\n# Hello",
	};
	ok(!(await call("create_presentation", args)).isError);
	equal((await call("create_presentation", args)).isError, true);
	const read = (await call("read_presentation", args, readToken)).structuredContent;
	equal(read.content, args.content);
	const updated = await call("edit_presentation", {
		...args,
		content: "# Updated",
		expectedRevision: read.revision,
	});
	ok(!updated.isError);
	equal(await storage.getDocumentContent("project/training/chapters/deck.md"), "# Updated");
	const binary = await storage.getDocumentBinary("project/training/chapters/deck.md");
	ok(binary);
	const document = new Y.Doc();
	Y.applyUpdate(document, binary);
	equal(document.getText("content").toJSON(), "# Updated");
	document.destroy();
	equal(
		(await call("edit_presentation", { ...args, expectedRevision: read.revision })).isError,
		true,
	);
});

test("edits the live collaborative document and rejects stale revisions", async () => {
	const name = "project/training/live.md";
	await storage.saveDocumentContent(name, "# Saved");
	const connection = await collab.openDirectConnection(name);
	try {
		await connection.transact((document) => document.getText("content").insert(0, "Live "));
		const read = (await call("read_presentation", { projectId: "training", fileId: "live.md" }))
			.structuredContent;
		equal(read.content, "Live # Saved");
		await connection.transact((document) => document.getText("content").insert(0, "New "));
		const stale = await call("edit_presentation", {
			projectId: "training",
			fileId: "live.md",
			expectedRevision: read.revision,
			content: "# Stale",
		});
		equal(stale.isError, true);
		const current = (await call("read_presentation", { projectId: "training", fileId: "live.md" }))
			.structuredContent;
		const edited = await call("edit_presentation", {
			projectId: "training",
			fileId: "live.md",
			expectedRevision: current.revision,
			content: "# AI edit",
		});
		ok(!edited.isError);
		equal(collab.documents.get(name)!.getText("content").toJSON(), "# AI edit");
	} finally {
		await connection.disconnect();
	}
});

test("rejects unsafe paths and unauthorized projects", async () => {
	for (const fileId of [
		"../escape.md",
		"/absolute.md",
		".hidden/deck.md",
		"folder//deck.md",
		"deck.css",
		"deck.md.yjs",
	]) {
		equal(
			(await call("create_presentation", { projectId: "training", fileId, content: "# Bad" }))
				.isError,
			true,
			fileId,
		);
	}
	equal((await call("list_files", { projectId: "other-project" })).isError, true);
});

test("preserves emoji characters across collaborative edits", async () => {
	const args = { projectId: "training", fileId: "emoji.md", content: "# 😀 Hello 😀" };
	await call("create_presentation", args);
	const read = (await call("read_presentation", args)).structuredContent;
	const content = "# 😁 Hello 😁";
	const edited = await call("edit_presentation", {
		...args,
		content,
		expectedRevision: read.revision,
	});
	ok(!edited.isError);
	equal((await call("read_presentation", args)).structuredContent.content, content);
});

test("reads and edits Unicode and upper-case Markdown names that list_files returns", async () => {
	for (const fileId of ["Einführung.md", "intro (v2).md", "Slides.MD"]) {
		await storage.saveDocumentContent(`project/training/${fileId}`, "# Before");
		const args = { projectId: "training", fileId };
		const read = await call("read_presentation", args);
		ok(!read.isError, fileId);
		const edited = await call("edit_presentation", {
			...args,
			content: "# After",
			expectedRevision: read.structuredContent.revision,
		});
		ok(!edited.isError, fileId);
		equal(await storage.getDocumentContent(`project/training/${fileId}`), "# After");
	}
	for (const fileId of ["back\\slash.md", "control\u0007.md"]) {
		equal((await call("read_presentation", { projectId: "training", fileId })).isError, true);
	}
});

test("hashes the CRDT state that edits load when the Markdown file was replaced", async () => {
	const name = "project/training/uploaded.md";
	const args = { projectId: "training", fileId: "uploaded.md" };
	await call("create_presentation", { ...args, content: "# Original" });
	const original = (await call("read_presentation", args)).structuredContent;
	ok(
		!(
			await call("edit_presentation", {
				...args,
				content: "# Edited",
				expectedRevision: original.revision,
			})
		).isError,
	);
	// An upload rewrites only the plain-text file and leaves the CRDT state behind.
	await storage.saveDocumentContent(name, "# Uploaded");
	const read = (await call("read_presentation", args)).structuredContent;
	equal(read.content, "# Edited");
	const edited = await call("edit_presentation", {
		...args,
		content: "# AI edit",
		expectedRevision: read.revision,
	});
	ok(!edited.isError);
	equal(await storage.getDocumentContent(name), "# AI edit");
});

test("reports path conflicts separately from existing presentations", async () => {
	await storage.saveDocumentContent("project/training/taken.md", "# Taken");
	const nested = await call("create_presentation", {
		projectId: "training",
		fileId: "taken.md/notes.md",
		content: "# Notes",
	});
	equal(nested.isError, true);
	match(nested.content[0].text, /conflicts with an existing file or folder/);
	await storage.createProjectDir("training", "chapters.md");
	const folder = await call("create_presentation", {
		projectId: "training",
		fileId: "chapters.md",
		content: "# Chapters",
	});
	equal(folder.isError, true);
	match(folder.content[0].text, /conflicts with an existing file or folder/);
	const existing = await call("create_presentation", {
		projectId: "training",
		fileId: "taken.md",
		content: "# Again",
	});
	match(existing.content[0].text, /already exists/);
});

test("does not recreate a presentation deleted while an edit is in progress", async () => {
	const name = "project/training/deleted.md";
	const args = { projectId: "training", fileId: "deleted.md" };
	await storage.saveDocumentContent(name, "# Before");
	const read = (await call("read_presentation", args)).structuredContent;
	const connection = await collab.openDirectConnection(name);
	const path = join(tempDir, "presentations", "training", "deleted.md");
	const remove = () => {
		rmSync(path, { force: true });
		rmSync(`${path}.yjs`, { force: true });
	};
	collab.documents.get(name)!.once("update", remove);
	try {
		const edited = await call("edit_presentation", {
			...args,
			content: "# After",
			expectedRevision: read.revision,
		});
		equal(edited.isError, true);
		match(edited.content[0].text, /renamed, moved or deleted/);
	} finally {
		collab.documents.get(name)?.off("update", remove);
		await connection.disconnect();
	}
	equal(await storage.getDocumentContent(name), undefined);
	equal(await storage.getDocumentBinary(name), undefined);
});

test("persists an admitted edit when Git sync reserves the project during the transaction", async () => {
	const name = "project/training/sync-race.md";
	await storage.saveDocumentContent(name, "# Before");
	const connection = await collab.openDirectConnection(name);
	const operations = await import("../projects/project-operations.ts");
	let releaseSync: (() => void) | undefined;
	const reserveSync = () => {
		releaseSync ??= operations.beginProjectSync("training")?.release;
	};
	collab.documents.get(name)!.on("update", reserveSync);
	try {
		const args = { projectId: "training", fileId: "sync-race.md" };
		const read = (await call("read_presentation", args)).structuredContent;
		const edited = await call("edit_presentation", {
			...args,
			expectedRevision: read.revision,
			content: "# After",
		});
		ok(!edited.isError);
		ok(operations.isProjectSyncing("training"));
		equal(await storage.getDocumentContent(name), "# After");
		const binary = await storage.getDocumentBinary(name);
		ok(binary);
		const persisted = new Y.Doc();
		Y.applyUpdate(persisted, binary);
		equal(persisted.getText("content").toJSON(), "# After");
		persisted.destroy();
	} finally {
		collab.documents.get(name)?.off("update", reserveSync);
		releaseSync?.();
		await connection.disconnect();
	}
});

test("manages project files, folders and collaborative CSS through MCP", async () => {
	const projectId = "training";
	const project = { projectId };
	const fileId = "mcp-files/theme.css";
	const content = "/* @theme custom */\nsection { color: red; }";
	const css = { projectId, fileId };
	const folder = { projectId, path: "mcp-files" };

	ok(!(await call("create_folder", folder)).isError);
	ok(!(await call("create_file", { ...css, content })).isError);
	equal((await call("create_file", { ...css, content: "overwrite" })).isError, true);
	const { revision } = (await call("read_file", css, readToken)).structuredContent;
	const edited = content.replace("red", "blue");
	ok(!(await call("edit_file", { ...css, content: edited, expectedRevision: revision })).isError);
	equal((await call("edit_file", { ...css, content, expectedRevision: revision })).isError, true);

	const png = "mcp-files/banner.png";
	const base64 = "iVBORw0KGgo=";
	const asset = { projectId, path: png, base64 };
	equal((await call("upload_asset", asset)).structuredContent.size, 8);
	equal((await call("upload_asset", asset)).isError, true);
	equal((await call("upload_asset", { ...asset, path: "mcp-files/bad.exe" })).isError, true);
	equal(
		(await call("upload_asset", { ...asset, path: "mcp-files/bad.png", base64: "!!!!" })).isError,
		true,
	);
	equal((await storage.readProjectFile(projectId, png))?.length, 8);

	for (const path of ["../escape", ".git/config", "__presence", "mcp-files/theme.css.yjs"]) {
		equal((await call("delete_entry", { projectId, path, recursive: true })).isError, true);
	}
	equal((await call("move_entry", { ...folder, destination: "mcp-files/child" })).isError, true);
	ok(!(await call("create_folder", { projectId, path: "mcp-archive" })).isError);
	const renamedFolder = "mcp-archive/contents";
	equal(
		(await call("move_entry", { ...folder, destination: renamedFolder })).structuredContent.newPath,
		renamedFolder,
	);
	const renamedCss = "mcp-archive/design.css";
	const newCss = { ...project, fileId: renamedCss };
	equal(
		(
			await call("move_entry", {
				...project,
				path: `${renamedFolder}/theme.css`,
				destination: renamedCss,
			})
		).structuredContent.newPath,
		renamedCss,
	);
	equal((await call("read_file", css, readToken)).isError, true);
	equal((await call("read_file", newCss, readToken)).structuredContent.content, edited);
	ok(await storage.getDocumentBinary(`project/${projectId}/${renamedCss}`));
	equal(
		(
			await call("move_entry", {
				...project,
				path: renamedCss,
				destination: `${renamedFolder}/banner.png`,
			})
		).isError,
		true,
	);

	const collision = "mcp-archive/collision.css";
	ok(!(await call("create_file", { ...project, fileId: collision, content })).isError);
	equal(
		(await call("move_entry", { ...project, path: renamedCss, destination: collision })).isError,
		true,
	);
	equal(
		(await call("read_file", { ...project, fileId: collision }, readToken)).structuredContent
			.content,
		content,
	);
	equal(
		(await call("delete_entry", { ...project, path: collision })).structuredContent.deleted,
		true,
	);

	const competingPaths = ["one.css", "two.css"].map((name) => `mcp-archive/${name}`);
	for (const path of competingPaths) {
		ok(!(await call("create_file", { ...project, fileId: path, content })).isError);
	}
	const races = await Promise.all(
		competingPaths.map((path) => call("move_entry", { ...project, path, destination: collision })),
	);
	equal(races.filter((result) => !result.isError).length, 1);
	ok(!(await call("delete_entry", { ...project, path: collision })).isError);
	for (const path of competingPaths) {
		if ((await storage.getDocumentContent(`project/${projectId}/${path}`)) !== undefined) {
			ok(!(await call("delete_entry", { ...project, path })).isError);
		}
	}

	const target = { projectId, path: "mcp-archive" };
	deepEqual((await call("delete_entry", { ...target, dryRun: true })).structuredContent, {
		path: target.path,
		deleted: false,
		requiresRecursive: true,
		affectedPaths: ["mcp-archive", renamedFolder, `${renamedFolder}/banner.png`, renamedCss],
	});
	equal((await call("delete_entry", target)).isError, true);
	equal(
		(await call("delete_entry", { ...target, recursive: true })).structuredContent.deleted,
		true,
	);
	equal(await storage.getDocumentContent(`project/${projectId}/${renamedCss}`), undefined);
	ok(!(await call("create_folder", folder)).isError);
	equal((await call("delete_entry", folder)).structuredContent.deleted, true);
});

test("diagnoses missing project references and renders a deck with includes", async () => {
	const projectId = "training";
	const fileId = "mcp-preview/deck.md";
	const deck = { projectId, fileId };
	for (const [path, content] of [
		[
			fileId,
			"---\nmarp: true\ntheme: local\n---\n# First\n\n![logo](logo.png)\n\n<img src='html.png'>\n\n<!-- @include: slides/next.md -->\n\n<!-- @include: missing.md -->",
		],
		["mcp-preview/slides/next.md", "---\n\n# Second\n\n![diagram](diagram.png)"],
		[
			"mcp-preview/local.css",
			"/* @theme local */\nsection { background-image: url('pattern.png'); }",
		],
	] as const) {
		ok(!(await call("create_file", { projectId, fileId: path, content })).isError);
	}
	ok(
		!(
			await call("upload_asset", {
				projectId,
				path: "mcp-preview/logo.png",
				base64: "iVBORw0KGgo=",
			})
		).isError,
	);
	const references = (await call("check_references", { projectId, path: "mcp-preview" }, readToken))
		.structuredContent.references;
	ok(
		references.some(
			(ref: { kind: string; target: string; missing: boolean }) =>
				ref.kind === "include" && ref.target === "mcp-preview/slides/next.md" && !ref.missing,
		),
	);
	ok(
		references.some(
			(ref: { kind: string; target: string; missing: boolean }) =>
				ref.kind === "css-url" && ref.target === "mcp-preview/pattern.png" && ref.missing,
		),
	);
	ok(
		references.some(
			(ref: { kind: string; target: string; missing: boolean }) =>
				ref.kind === "image" && ref.target === "mcp-preview/html.png" && ref.missing,
		),
	);
	const usedBy = (
		await call("check_references", { projectId, path: "mcp-preview/logo.png" }, readToken)
	).structuredContent.references;
	equal(usedBy[0]?.source, fileId);
	equal(usedBy[0]?.missing, false);
	ok(
		references.some(
			(ref: { source: string; kind: string; target: string }) =>
				ref.source === fileId && ref.kind === "image" && ref.target === "mcp-preview/diagram.png",
		),
	);
	const preview = (await call("preview_presentation", deck, readToken)).structuredContent;
	equal(preview.slideCount, 2);
	ok(preview.issues.some((issue: string) => issue.includes("missing.md")));
	ok(preview.issues.some((issue: string) => issue.includes("diagram.png")));
	ok(preview.issues.some((issue: string) => issue.includes("html.png")));
	ok(!(await call("delete_entry", { projectId, path: "mcp-preview", recursive: true })).isError);
});

test("rechecks collaborator permissions and excludes writes during Git synchronization", async () => {
	const { createPresentationServer } = await import("./server.ts");
	const { createMcpHandler } = await import("@modelcontextprotocol/server");
	const reader = createMcpHandler(() =>
		createPresentationServer("reader", new Set(["presentations:read", "presentations:write"])),
	);
	const request = () =>
		new Request(`${origin}/mcp`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				"mcp-protocol-version": "2025-11-25",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "create_presentation",
					arguments: { projectId: "training", fileId: "reader.md", content: "# Bad" },
				},
			}),
		});
	const response = await reader.fetch(request());
	match(await response.text(), /access denied/);
	db.prepare("delete from project_collaborator where userId = 'reader'").run();
	match(await (await reader.fetch(request())).text(), /access denied/);
	const { beginProjectSync } = await import("../projects/project-operations.ts");
	const sync = beginProjectSync("training");
	ok(sync);
	try {
		const denied = await call("create_presentation", {
			projectId: "training",
			fileId: "sync.md",
			content: "# Bad",
		});
		equal(denied.isError, true);
		match(denied.content[0].text, /syncing with Git/);
	} finally {
		sync.release();
	}
});

test("pulls from and pushes to the project's Git repository with a commit message", async (t) => {
	const documentName = "project/training/chapters/deck.md";
	const editor = await collab.openDirectConnection(documentName, { userId: "owner" });
	try {
		const notConfigured = await call("push_to_git", { projectId: "training" });
		equal(notConfigured.isError, true);
		match(notConfigured.content[0].text, /not configured/);
		ok(collab.documents.has(documentName));
	} finally {
		await editor.disconnect();
	}

	const remote = join(tempDir, "git-remote");
	await mkdir(remote);
	const run = (dir: string, ...args: string[]) =>
		execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
	run(remote, "init", "-b", "main");
	run(remote, "config", "receive.denyCurrentBranch", "ignore");
	await writeFile(join(remote, "remote.md"), "# Remote");
	run(remote, "add", ".");
	run(remote, "-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-m", "Initial");
	const { runGitTasksInProcess } = await import("../projects/git-process.ts");
	runGitTasksInProcess();
	t.after(() => runGitTasksInProcess(false));
	t.mock.method(git, "listServerRefs", () =>
		Promise.resolve([{ ref: "refs/heads/main", oid: run(remote, "rev-parse", "main") }]),
	);
	t.mock.method(git, "fetch", ({ dir }: { dir: string }) => {
		run(dir, "fetch", remote, "+main:refs/remotes/origin/main");
		return Promise.resolve();
	});
	t.mock.method(git, "push", ({ dir }: { dir: string }) => {
		run(dir, "push", remote, "main");
		return Promise.resolve();
	});
	const { configureProjectGit, syncProjectWithGit } = await import("../projects/git-actions.ts");
	await configureProjectGit({
		projectId: "training",
		remoteUrl: "https://example.com/slides.git",
		branch: "main",
		credentials: {},
	});

	const pulled = await call("pull_from_git", { projectId: "training" });
	ok(!pulled.isError, pulled.content[0].text);
	equal(pulled.structuredContent.pulled, true);
	equal(await storage.getDocumentContent("project/training/remote.md"), "# Remote");
	ok(
		!(
			await call("create_presentation", {
				projectId: "training",
				fileId: "git.md",
				content: "# Git",
			})
		).isError,
	);
	const pushed = await call("push_to_git", { projectId: "training", message: "Add Git deck" });
	ok(!pushed.isError, pushed.content[0].text);
	equal(pushed.structuredContent.pushed, true);
	equal(
		run(remote, "log", "-1", "--format=%s|%an <%ae>"),
		"Add Git deck|owner <owner@example.com>",
	);
	equal(run(remote, "show", "main:git.md"), "# Git");

	const again = await call("push_to_git", { projectId: "training", message: "Nothing new" });
	ok(!again.isError, again.content[0].text);
	equal(again.structuredContent.committed, false);
	match(again.structuredContent.note, /message was not used/);

	ok(
		!(
			await call("create_presentation", {
				projectId: "training",
				fileId: "pulled.md",
				content: "# Pulled",
			})
		).isError,
	);
	ok(!(await call("pull_from_git", { projectId: "training", message: "Add pulled deck" })).isError);
	ok(!(await call("push_to_git", { projectId: "training" })).isError);
	equal(run(remote, "log", "-1", "--format=%s"), "Add pulled deck");

	for (const message of [
		"Fix typo\n\nCo-authored-by: Someone <a@example.com>",
		"Hide\u202etext",
		"Fix\u200ftypo",
		"Zero\u200bwidth",
		"   ",
	]) {
		equal((await call("push_to_git", { projectId: "training", message })).isError, true);
	}
	const resolutions = Object.fromEntries(
		Array.from({ length: 201 }, (_, index) => [`deck-${index}.md`, "remote"]),
	);
	equal((await call("pull_from_git", { projectId: "training", resolutions })).isError, true);

	const operations = await import("../projects/project-operations.ts");
	const { removeProjectGitRepository } = await import("../projects/git-sync.ts");
	async function syncAfterChange(userId: string, change: () => void | Promise<void>) {
		const release = operations.beginProjectWrite("training")!;
		let settled = false;
		const sync = (async () => {
			try {
				return await syncProjectWithGit("training", userId, { type: "push", message: "Changed" });
			} finally {
				settled = true;
			}
		})();
		while (!operations.isProjectSyncing("training") && !settled) {
			await new Promise((resolve) => setImmediate(resolve));
		}
		ok(!settled, "the sync stopped before taking the lock");
		await change();
		release();
		return sync;
	}
	const head = run(remote, "rev-parse", "main");
	const openEditor = await collab.openDirectConnection(documentName, { userId: "owner" });
	const closeConnections = t.mock.method(collab, "closeConnections");
	try {
		db.prepare(
			"insert into project_collaborator (projectId,userId,readOnly,createdAt) values ('training','outsider',0,?)",
		).run(new Date().toISOString());
		await rejects(
			syncAfterChange("outsider", () => {
				db.prepare("delete from project_collaborator where userId = 'outsider'").run();
			}),
			/write access/,
		);
		await rejects(
			syncAfterChange("owner", () => removeProjectGitRepository("training")),
			/not configured/,
		);
		equal(closeConnections.mock.callCount(), 0);
	} finally {
		await openEditor.disconnect();
	}
	equal(run(remote, "rev-parse", "main"), head);
});
