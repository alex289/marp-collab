# Backend Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the backend's Project Modules and reduce `routes/api/projects.ts` to focused HTTP Adapters without changing observable behavior.

**Architecture:** Introduce pure Project Document Identity and Project Access Policy Modules first, then move Collaborator Membership, Project Storage, and Project Content workflows behind focused Interfaces. Split the large route only after behavior has moved, so the new route files remain thin Adapters rather than smaller copies of the current coupling.

**Tech Stack:** TypeScript ESM, Node.js 24+, Hono, Better SQLite3, Hocuspocus/Yjs, Zod, Node test runner, pnpm 11.7.0.

## Global Constraints

- Preserve every HTTP route, request shape, response body, status code, header, and error message.
- Preserve Project Access rules, collaboration connection behavior, filesystem layout, `.yjs` state, ZIP contents, and PDF behavior.
- Add no runtime dependency and make no database or migration change.
- Do not redesign import-time DB, Auth, Hocuspocus, or application singletons.
- Keep all work unstaged and uncommitted until user review.
- Use tabs and existing Oxfmt conventions.

---

## File map

**Create:**

- `backend/src/projects/document-identity.ts` — canonical Project Document formatting and parsing.
- `backend/src/projects/document-identity.test.ts` — identity Interface tests.
- `backend/src/projects/access-policy.ts` — intent-based Project Access decisions.
- `backend/src/projects/access-policy.test.ts` — owner/collaborator/outsider policy tests.
- `backend/src/projects/collaborator-membership.ts` — Membership mutations plus connection invalidation.
- `backend/src/projects/collaborator-membership.test.ts` — end-to-end Membership Module tests.
- `backend/src/projects/storage.ts` — moved and deepened Project Storage Implementation.
- `backend/src/projects/storage.test.ts` — moved Storage tests plus missing coverage.
- `backend/src/projects/project-content.ts` — content mutations plus Project Events.
- `backend/src/projects/project-content.test.ts` — mutation-plus-event tests.
- `backend/src/routes/api/projects/project-routes.ts` — Project metadata HTTP Adapter.
- `backend/src/routes/api/projects/collaborator-routes.ts` — Collaborator Membership HTTP Adapter.
- `backend/src/routes/api/projects/content-routes.ts` — Project Content HTTP Adapter.
- `backend/src/routes/api/projects/export-routes.ts` — ZIP/PDF HTTP Adapter.
- `backend/src/routes/api/projects/schemas.ts` — unchanged Zod request contracts.
- `backend/src/collab/marp-render.test.ts` — PDF input Characterization Tests.
- `backend/src/helpers/gotenberg.test.ts` — Gotenberg request Characterization Tests.

**Modify:**

- `backend/src/routes/api/projects.ts` — route composition only.
- `backend/src/routes/api/projects.test.ts` — broader route Characterization Tests.
- `backend/src/collab/hocuspocus.ts` — consume identity, access, and Storage Interfaces.
- `backend/src/collab/connections.ts` and `.test.ts` — consume canonical identity.
- `backend/src/collab/project-events.ts` — use parsed Project identity.
- `backend/src/collab/marp-render.ts` — consume moved Storage.
- `backend/src/helpers/gotenberg.ts` — consume Storage bytes instead of absolute paths.
- `backend/src/db/models/project-collaborator.ts` and `.test.ts` — separate Membership and joined list shapes.

**Delete after callers migrate:**

- `backend/src/collab/files.ts`
- `backend/src/collab/files.test.ts`
- `backend/src/helpers/project-auth.ts`
- `backend/src/helpers/project-auth.test.ts`
- `backend/src/helpers/file-exists.ts`

---

### Task 1: Capture current route behavior

**Files:**

- Modify: `backend/src/routes/api/projects.test.ts`

**Interfaces:**

- Consumes: existing `projectsRouter`, SQLite models, and Project Storage functions.
- Produces: Characterization Tests for exact authorization and upload responses used by later tasks.

- [ ] **Step 1: Make the route fixture select the acting user per request**

Replace the fixed user middleware with a header-driven fixture while keeping the current setup:

```ts
app.use("*", async (c, next) => {
	const userId = c.req.header("x-test-user-id");
	c.set(
		"user",
		userId
			? ({ id: userId, name: userId, email: `${userId}@example.com` } as HonoVariables["user"])
			: null,
	);
	c.set("session", null);
	await next();
});
```

Insert owner, read-write collaborator, read-only collaborator, and outsider users in `before`, then add both collaborator rows for `upload-proj`.

- [ ] **Step 2: Add exact access Characterization Tests**

Add these assertions with the fixture IDs created in Step 1:

```ts
test("rejects an unauthenticated file listing", async () => {
	const response = await app.request("/upload-proj/files");
	equal(response.status, 401);
	deepEqual(await response.json(), { error: "Unauthorized" });
});

test("allows a read-only collaborator to list files", async () => {
	const response = await app.request("/upload-proj/files", {
		headers: { "x-test-user-id": "route-reader" },
	});
	equal(response.status, 200);
});

test("rejects a read-only collaborator creating a file", async () => {
	const response = await app.request("/upload-proj/files", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-test-user-id": "route-reader",
		},
		body: JSON.stringify({ name: "blocked.md" }),
	});
	equal(response.status, 403);
	deepEqual(await response.json(), { error: "You do not have write access to this project" });
});

test("distinguishes a collaborator from an outsider when managing collaborators", async () => {
	const collaboratorResponse = await app.request("/upload-proj/collaborators", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-test-user-id": "route-writer",
		},
		body: JSON.stringify({ email: "route-outsider@example.com", readOnly: false }),
	});
	equal(collaboratorResponse.status, 403);
	deepEqual(await collaboratorResponse.json(), {
		error: "Only the project owner can manage collaborators",
	});

	const outsiderResponse = await app.request("/upload-proj/collaborators", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-test-user-id": "route-outsider",
		},
		body: JSON.stringify({ email: "route-reader@example.com", readOnly: false }),
	});
	equal(outsiderResponse.status, 403);
	deepEqual(await outsiderResponse.json(), { error: "Project not found or access denied" });
});
```

Update existing upload requests to send `x-test-user-id: user-1`.

- [ ] **Step 3: Run the focused Characterization Tests**

Run:

```bash
pnpm --filter server exec node --test src/routes/api/projects.test.ts
```

Expected: every test passes and the process exits. If assertions pass but the process does not exit, stop implementation and diagnose the open handle before continuing.

---

### Task 2: Introduce canonical Project Document Identity

**Files:**

- Create: `backend/src/projects/document-identity.ts`
- Create: `backend/src/projects/document-identity.test.ts`
- Modify: `backend/src/collab/files.ts`
- Modify: `backend/src/collab/hocuspocus.ts`
- Modify: `backend/src/collab/connections.ts`
- Modify: `backend/src/collab/project-events.ts`
- Modify: `backend/src/collab/files.test.ts`
- Modify: `backend/src/collab/connections.test.ts`

**Interfaces:**

- Produces:
  - `toDocumentName(projectId: string, fileId: string): string`
  - `parseProjectDocumentName(documentName: string): ProjectDocumentIdentity | null`
  - `documentBelongsToProject(documentName: string, projectId: string): boolean`

- [ ] **Step 1: Write identity Interface tests**

```ts
import { describe, test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
	documentBelongsToProject,
	parseProjectDocumentName,
	toDocumentName,
} from "./document-identity.ts";

describe("Project Document Identity", () => {
	test("roundtrips a nested file identity", () => {
		const name = toDocumentName("project-1", "theme/custom.css");
		equal(name, "project/project-1/theme/custom.css");
		deepEqual(parseProjectDocumentName(name), {
			projectId: "project-1",
			fileId: "theme/custom.css",
		});
	});

	test("rejects names outside the Project grammar", () => {
		equal(parseProjectDocumentName("other/project-1/slides.md"), null);
		equal(parseProjectDocumentName("project//slides.md"), null);
	});

	test("compares Project membership by parsed identity", () => {
		equal(documentBelongsToProject("project/project-1/slides.md", "project-1"), true);
		equal(documentBelongsToProject("project/project-10/slides.md", "project-1"), false);
	});
});
```

- [ ] **Step 2: Run the new test and verify red**

Run:

```bash
pnpm --filter server exec node --test src/projects/document-identity.test.ts
```

Expected: FAIL because `document-identity.ts` does not exist.

- [ ] **Step 3: Implement the identity Module**

```ts
export type ProjectDocumentIdentity = {
	projectId: string;
	fileId: string;
};

export function toDocumentName(projectId: string, fileId: string): string {
	return `project/${projectId}/${fileId}`;
}

export function parseProjectDocumentName(documentName: string): ProjectDocumentIdentity | null {
	const parts = documentName.split("/");
	if (parts[0] !== "project" || !parts[1]) {
		return null;
	}

	return { projectId: parts[1], fileId: parts.slice(2).join("/") };
}

export function documentBelongsToProject(documentName: string, projectId: string): boolean {
	return parseProjectDocumentName(documentName)?.projectId === projectId;
}
```

- [ ] **Step 4: Migrate all four consumers**

In `files.ts`, remove the local formatter and parse with `parseProjectDocumentName`; keep its existing non-empty file ID, Project ID regex, absolute path, traversal, and containment checks.

In `hocuspocus.ts`, delete its local parser and import the canonical parser.

In `connections.ts`, replace `getProjectId` parsing with the canonical parser.

In `project-events.ts`, replace `startsWith` with `documentBelongsToProject`.

- [ ] **Step 5: Run affected tests**

```bash
pnpm --filter server exec node --test src/projects/document-identity.test.ts src/collab/files.test.ts src/collab/connections.test.ts
```

Expected: PASS with existing path and connection behavior unchanged.

---

### Task 3: Deepen Project Access Policy

**Files:**

- Create: `backend/src/projects/access-policy.ts`
- Create: `backend/src/projects/access-policy.test.ts`
- Modify: `backend/src/collab/hocuspocus.ts`
- Modify: `backend/src/routes/api/projects.ts`
- Delete: `backend/src/helpers/project-auth.ts`
- Delete: `backend/src/helpers/project-auth.test.ts`

**Interfaces:**

- Produces:
  - `ProjectPermission = "read" | "write" | "manage-collaborators"`
  - `ProjectAuthorization` discriminated by `allowed`
  - `authorizeProject(projectId, userId, permission): ProjectAuthorization`

- [ ] **Step 1: Move and expand policy tests**

Create the same SQLite fixture as `project-auth.test.ts`, then assert exact decisions:

```ts
deepEqual(authorizeProject("pa-proj", "pa-owner", "manage-collaborators"), {
	allowed: true,
	access: { isOwner: true, readOnly: false },
});
deepEqual(authorizeProject("pa-proj", "pa-collab-rw", "write"), {
	allowed: true,
	access: { isOwner: false, readOnly: false },
});
deepEqual(authorizeProject("pa-proj", "pa-collab-ro", "write"), {
	allowed: false,
	reason: "read-only",
});
deepEqual(authorizeProject("pa-proj", "pa-collab-rw", "manage-collaborators"), {
	allowed: false,
	reason: "not-owner",
});
deepEqual(authorizeProject("pa-proj", "pa-outsider", "read"), {
	allowed: false,
	reason: "no-access",
});
```

- [ ] **Step 2: Run the policy test and verify red**

```bash
pnpm --filter server exec node --test src/projects/access-policy.test.ts
```

Expected: FAIL because the new Module does not exist.

- [ ] **Step 3: Implement the policy decision**

```ts
import { getCollaborator } from "../db/models/project-collaborator.ts";
import { getProjectById } from "../db/models/project.ts";

export type ProjectAccess = { isOwner: boolean; readOnly: boolean };
export type ProjectPermission = "read" | "write" | "manage-collaborators";
export type ProjectAuthorization =
	| { allowed: true; access: ProjectAccess }
	| { allowed: false; reason: "no-access" | "read-only" | "not-owner" };

export function authorizeProject(
	projectId: string,
	userId: string,
	permission: ProjectPermission,
): ProjectAuthorization {
	const project = getProjectById(projectId);
	if (!project) {
		return { allowed: false, reason: "no-access" };
	}
	if (project.ownerId === userId) {
		return { allowed: true, access: { isOwner: true, readOnly: false } };
	}

	const collaborator = getCollaborator(projectId, userId);
	if (!collaborator) {
		return { allowed: false, reason: "no-access" };
	}
	if (permission === "manage-collaborators") {
		return { allowed: false, reason: "not-owner" };
	}
	if (permission === "write" && collaborator.readOnly) {
		return { allowed: false, reason: "read-only" };
	}
	return {
		allowed: true,
		access: { isOwner: false, readOnly: collaborator.readOnly },
	};
}
```

- [ ] **Step 4: Migrate callers without changing error mapping**

Use `read` for reads and exports, `write` for content mutations, and `manage-collaborators` for owner-only Project or Membership operations. Map `no-access`, `read-only`, and `not-owner` to the exact existing responses in each handler. Hocuspocus uses `read`, throws `Forbidden` on any denial, and copies `authorization.access.readOnly` when allowed.

- [ ] **Step 5: Delete the shallow old Module and run tests**

```bash
pnpm --filter server exec node --test src/projects/access-policy.test.ts src/routes/api/projects.test.ts
```

Expected: PASS, including the distinct outsider, read-only, and non-owner responses.

---

### Task 4: Make Collaborator Membership consistent

**Files:**

- Modify: `backend/src/db/models/project-collaborator.ts`
- Modify: `backend/src/db/models/project-collaborator.test.ts`
- Create: `backend/src/projects/collaborator-membership.ts`
- Create: `backend/src/projects/collaborator-membership.test.ts`
- Modify: `backend/src/routes/api/projects.ts`

**Interfaces:**

- Produces:
  - `ProjectMembership` for the detail query.
  - `ProjectCollaborator` for joined list queries.
  - `listProjectCollaborators(projectId: string, actorUserId: string): MembershipResult<ProjectCollaborator[]>`.
  - `addProjectCollaborator(input: { projectId: string; actorUserId: string; email: string; readOnly: boolean }): MembershipResult`.
  - `updateProjectCollaborator(input: { projectId: string; actorUserId: string; userId: string; readOnly: boolean }): MembershipResult`.
  - `removeProjectCollaborator(input: { projectId: string; actorUserId: string; userId: string }): MembershipResult`.

- [ ] **Step 1: Separate persistence shapes**

Use these types and two mappers:

```ts
export type ProjectMembership = {
	projectId: string;
	userId: string;
	readOnly: boolean;
	createdAt: Date;
};

export type ProjectCollaborator = ProjectMembership & {
	projectName: string;
	userName: string;
	ownerName: string;
};
```

`getCollaborator` returns `ProjectMembership | undefined`; joined list functions keep returning `ProjectCollaborator[]`. Add assertions that Membership detail has only its four declared properties and joined lists contain display fields.

- [ ] **Step 2: Write complete Membership workflow tests**

Create owner, target user, Project, and a fake closable connection. Verify:

```ts
deepEqual(
	await addProjectCollaborator({
		projectId: "membership-project",
		actorUserId: "membership-owner",
		email: "target@example.com",
		readOnly: false,
	}),
	{ ok: true },
);

deepEqual(
	await updateProjectCollaborator({
		projectId: "membership-project",
		actorUserId: "membership-owner",
		userId: "membership-target",
		readOnly: true,
	}),
	{ ok: true },
);
equal(connection.closeCalls, 1);
```

Also verify duplicate add returns `already-collaborator`, missing email returns `user-not-found`, a collaborator actor returns `owner-required`, an outsider returns `access-denied`, an unchanged flag leaves a registered connection open, and removal closes it.

- [ ] **Step 3: Implement typed Membership outcomes**

```ts
export type MembershipFailure =
	| "access-denied"
	| "owner-required"
	| "user-not-found"
	| "already-collaborator"
	| "collaborator-not-found";

type MembershipSuccess<T> = [T] extends [undefined] ? { ok: true } : { ok: true; value: T };

export type MembershipResult<T = undefined> =
	MembershipSuccess<T> | { ok: false; reason: MembershipFailure };
```

All four operations authorize internally. Map `no-access` to `access-denied` and `not-owner` to `owner-required`. Update closes connections only when the stored flag changes; remove preserves current success behavior even when no Membership row exists.

- [ ] **Step 4: Replace route orchestration with Module calls**

Keep Zod parsing and exact HTTP responses in the route. Remove direct imports of user lookup, Membership models, and connection invalidation from `projects.ts`.

- [ ] **Step 5: Run persistence, Membership, connection, and route tests**

```bash
pnpm --filter server exec node --test src/db/models/project-collaborator.test.ts src/projects/collaborator-membership.test.ts src/collab/connections.test.ts src/routes/api/projects.test.ts
```

Expected: PASS with mutation and connection invalidation verified through one Module Interface.

---

### Task 5: Move and deepen Project Storage

**Files:**

- Move: `backend/src/collab/files.ts` → `backend/src/projects/storage.ts`
- Move: `backend/src/collab/files.test.ts` → `backend/src/projects/storage.test.ts`
- Modify: `backend/src/collab/hocuspocus.ts`
- Modify: `backend/src/collab/marp-render.ts`
- Modify: `backend/src/helpers/gotenberg.ts`
- Modify: `backend/src/routes/api/projects.ts`
- Delete: `backend/src/helpers/file-exists.ts`

**Interfaces:**

- Keeps existing Project Content and Project Document operations.
- Adds `readProjectFile(projectId, fileId): Promise<Uint8Array | undefined>`.
- Adds `openProjectFile(projectId, fileId): Promise<Readable | undefined>`.
- Makes filesystem path resolution private.

- [ ] **Step 1: Move Storage and its tests without behavior changes**

Move both files, update relative imports, and update every consumer import. Run the moved 48 tests before changing the Interface.

```bash
pnpm --filter server exec node --test src/projects/storage.test.ts
```

Expected: all moved tests PASS.

- [ ] **Step 2: Add tests for the smaller Interface**

Add byte-read success/missing cases, stream success/missing cases, ZIP exclusion of `.yjs`, and moving a file with its `.yjs` companion. Assert ZIP entries by consuming the returned archive stream into bytes and inspecting names with the existing archive tooling; add no dependency.

- [ ] **Step 3: Implement byte and stream reads**

```ts
export async function readProjectFile(
	projectId: string,
	fileId: string,
): Promise<Uint8Array | undefined> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return undefined;
	}
	try {
		return new Uint8Array(await readFile(filePath));
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
}

export async function openProjectFile(
	projectId: string,
	fileId: string,
): Promise<Readable | undefined> {
	const filePath = resolveProjectFilePath(projectId, fileId);
	if (!filePath) {
		return undefined;
	}
	try {
		await stat(filePath);
		return createReadStream(filePath);
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
}
```

Import `createReadStream` from `node:fs`. Stop exporting `resolveProjectFilePath`.

- [ ] **Step 4: Remove path leakage from consumers**

The asset download handler calls `openProjectFile`. Gotenberg calls `readProjectFile` and preserves its current behavior of skipping unreadable assets by catching read failures. Hocuspocus and Marp import their existing operations from Project Storage.

- [ ] **Step 5: Fold the shallow missing-file Helper into Storage**

Replace the one `fileExists` use with `getFileStatsSafe(path) !== undefined`, then delete `helpers/file-exists.ts`.

- [ ] **Step 6: Run Storage and all consumers**

```bash
pnpm --filter server exec node --test src/projects/storage.test.ts src/routes/api/projects.test.ts
pnpm --filter server typecheck
```

Expected: tests and TypeScript checks PASS; no caller imports or receives an absolute Project path.

---

### Task 6: Deepen Project Content mutations

**Files:**

- Create: `backend/src/projects/project-content.ts`
- Create: `backend/src/projects/project-content.test.ts`
- Modify: `backend/src/routes/api/projects.ts`

**Interfaces:**

- Produces:
  - `listProjectContent(projectId: string): Promise<ProjectContentEntry[]>`.
  - `createEditableProjectFile(projectId: string, fileId: string): Promise<ProjectContentEntry>`.
  - `createProjectFolder(projectId: string, folderPath: string): Promise<void>`.
  - `saveEditableProjectFile(projectId: string, fileId: string, content: string): Promise<ProjectContentEntry>`.
  - `saveBinaryProjectFile(projectId: string, fileId: string, data: Uint8Array): Promise<ProjectContentEntry>`.
  - `renameProjectContentFile(projectId: string, fileId: string, name: string): Promise<RenameProjectContentResult>`.
  - `moveProjectContentFile(projectId: string, fileId: string, destination: string): Promise<RenameProjectContentResult>`.
  - `renameProjectContentFolder(projectId: string, folderPath: string, name: string): Promise<RenameProjectContentResult>`.
  - `deleteProjectContentFile(projectId: string, fileId: string): Promise<DeleteProjectContentResult>`.
  - `deleteProjectContentFolder(projectId: string, folderPath: string): Promise<DeleteProjectContentResult>`.
- Every successful mutation emits one Project Event.
- Failed nullable/boolean mutations emit no Project Event.

- [ ] **Step 1: Write mutation-plus-event tests**

Register a fake document in `collabServer.documents` for the target Project and record `broadcastStateless` calls. Test:

```ts
const created = await createEditableProjectFile("content-project", "notes.md");
deepEqual(created, {
	id: "notes.md",
	label: "notes.md",
	type: "markdown",
	documentName: "project/content-project/notes.md",
});
deepEqual(messages, ["files-changed"]);
```

Verify each successful mutation sends exactly once and a missing rename/delete sends zero times.

- [ ] **Step 2: Implement Project Content operations**

Use these public result types:

```ts
export type ProjectContentEntry = DeckFile & { documentName?: string };

export type RenameProjectContentResult = { ok: true; id: string } | { ok: false };

export type DeleteProjectContentResult = { ok: true } | { ok: false };
```

Implement named functions that call Project Storage and `broadcastFilesChanged` only after success. Editable file creation and editable uploads return a `documentName`; binary uploads use `getFileType(fileId) ?? "asset"` exactly as today.

- [ ] **Step 3: Replace direct mutation-plus-broadcast sequences**

Migrate all nine sequences in `projects.ts`. Keep upload MIME checks, filename sanitization, destination validation, and HTTP response mapping in the Adapter for this refactoring.

- [ ] **Step 4: Run content, Storage, and route tests**

```bash
pnpm --filter server exec node --test src/projects/project-content.test.ts src/projects/storage.test.ts src/routes/api/projects.test.ts
```

Expected: PASS; route handlers no longer import mutation functions or `broadcastFilesChanged` directly.

---

### Task 7: Split the Project HTTP Adapter

**Files:**

- Create: `backend/src/routes/api/projects/project-routes.ts`
- Create: `backend/src/routes/api/projects/collaborator-routes.ts`
- Create: `backend/src/routes/api/projects/content-routes.ts`
- Create: `backend/src/routes/api/projects/export-routes.ts`
- Create: `backend/src/routes/api/projects/schemas.ts`
- Modify: `backend/src/routes/api/projects.ts`

**Interfaces:**

- Each file exports one Hono router as default.
- `projects.ts` composes the four routers and contains no handler Implementation.

- [ ] **Step 1: Move Zod contracts unchanged**

Export the existing nine schemas without changing regexes, refinements, defaults, maximum lengths, or error messages:

```ts
export {
	addCollaboratorSchema,
	createFileSchema,
	createFolderSchema,
	createProjectSchema,
	moveFileSchema,
	renameEntrySchema,
	updateCollaboratorSchema,
	updateProjectSchema,
	uploadDestinationSchema,
};
```

Keep each constant definition identical to its current form.

- [ ] **Step 2: Move handlers by domain**

Move only HTTP concerns and preserve route registration order within each file:

- Project routes: `GET /`, `POST /`, `GET /:projectId`, `PATCH /:projectId`, `DELETE /:projectId`.
- Collaborator routes: `GET`, `POST`, `PATCH`, and `DELETE` under `/:projectId/collaborators`.
- Export routes: ZIP before PDF.
- Content routes: listing, creation, folder creation, upload, asset download, file rename, file move, folder rename, folder delete, file delete.

- [ ] **Step 3: Replace the original file with composition only**

```ts
import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import collaboratorRoutes from "./projects/collaborator-routes.ts";
import contentRoutes from "./projects/content-routes.ts";
import exportRoutes from "./projects/export-routes.ts";
import projectRoutes from "./projects/project-routes.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.route("/", projectRoutes);
app.route("/", collaboratorRoutes);
app.route("/", exportRoutes);
app.route("/", contentRoutes);

export default app;
```

- [ ] **Step 4: Verify route inventory and behavior**

```bash
rg '^app\.(get|post|patch|delete)\(' backend/src/routes/api/projects -g '*.ts'
pnpm --filter server exec node --test src/routes/api/projects.test.ts
```

Expected: exactly the same 21 method/path registrations and all Characterization Tests PASS.

---

### Task 8: Characterize PDF Export without redesigning it

**Files:**

- Create: `backend/src/collab/marp-render.test.ts`
- Create: `backend/src/helpers/gotenberg.test.ts`
- Modify only if tests reveal extraction needed: `backend/src/collab/marp-render.ts`, `backend/src/helpers/gotenberg.ts`

**Interfaces:**

- Consumes existing `renderMarkdownForPdf` and `renderPdfViaGotenberg` Interfaces.
- Produces tests only; no new production Seam.

- [ ] **Step 1: Characterize Marp rendering**

With temporary Project Storage, save Markdown containing title, author, description, keywords, a relative image, and an external image. Save a CSS theme with a relative asset. Assert:

```ts
equal(rendered?.title, "Quarterly Review");
equal(rendered?.author, "Test Author");
deepEqual(rendered?.keywords, ["one", "two"]);
equal(rendered?.assets.get("assets/local.png"), "asset0.png");
ok(rendered?.html.includes("data:image/gif;base64"));
```

- [ ] **Step 2: Characterize the Gotenberg request**

Temporarily replace `globalThis.fetch`, capture URL and `RequestInit`, return `new Response("pdf", { status: 200 })`, and restore fetch in `finally`. Assert the URL ends with `/forms/chromium/convert/html`, the method is `POST`, FormData contains `index.html`, local asset Files, `printBackground=true`, `preferCssPageSize=true`, `emulatedMediaType=print`, and JSON metadata.

- [ ] **Step 3: Run PDF tests**

```bash
pnpm --filter server exec node --test src/collab/marp-render.test.ts src/helpers/gotenberg.test.ts
```

Expected: PASS without changing production behavior or adding an Adapter abstraction.

---

### Task 9: Complete verification and review handoff

**Files:**

- Modify mechanically if required: formatting only across changed backend files.
- Review: all uncommitted files.

**Interfaces:**

- Produces a verified, unstaged, uncommitted diff for user review.

- [ ] **Step 1: Format changed files**

```bash
pnpm format
```

Expected: Oxfmt updates formatting only.

- [ ] **Step 2: Run focused backend tests**

```bash
pnpm --filter server test
```

Expected: all backend tests PASS and the process exits. If it does not exit, diagnose the open handle and report the exact state.

- [ ] **Step 3: Run repository checks**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Expected: every command exits 0 with no warnings promoted to errors.

- [ ] **Step 4: Inspect scope and accidental behavior changes**

```bash
git diff --check
git status --short
git diff --stat
git diff -- backend
```

Expected: only the approved backend refactoring, tests, `CONTEXT.md`, and Superpowers documents are present. No environment file, database, generated output, staging, or commit exists.

- [ ] **Step 5: Present the review surface**

Report changed Module Interfaces, route line-count reduction, exact verification results, any unresolved test-runner issue, and clickable paths. Stop before staging or committing.
