# Backend Refactoring Design

**Status:** Approved for implementation on 2026-07-14

## Goal

Reduce backend architectural friction without changing observable functionality. Large route files become thin HTTP Adapters, security-sensitive decisions gain Locality, and Project Storage hides filesystem mechanics behind a smaller Interface.

## Global constraints

- Preserve all route paths, request shapes, response bodies, status codes, headers, and error messages.
- Preserve Project Access rules and collaboration connection behavior.
- Preserve Project Document names, local file layout, `.yjs` companion files, archive contents, and PDF output behavior.
- Add no runtime dependency and make no database or migration change.
- Do not redesign import-time DB, Auth, Hocuspocus, or application singletons.
- Do not commit or stage changes before user review.

## Chosen approach

Use incremental Deepening rather than a mechanical file split or a full ports-and-adapters rewrite. Characterization Tests first capture observable behavior. Pure identity and policy Modules are introduced next. Stateful Project Content and Collaborator Membership workflows then move behind focused Interfaces. Route splitting happens only after those Modules absorb the Implementation that currently leaks into HTTP handlers.

## Rejected approaches

### Mechanical route split

Splitting `projects.ts` by line range would shorten files but leave Project Access flags, Storage calls, Project Events, and connection invalidation distributed across callers. It improves navigation without improving Depth or Locality.

### Full dependency-injected architecture

Factories for DB, Auth, Hocuspocus, Storage, and the application would create many new Seams with only one production Adapter each. That scope is not required to preserve behavior and would make this refactoring harder to verify.

## Target Modules

### Project Document Identity

**Location:** `backend/src/projects/document-identity.ts`

The Module owns formatting, parsing, and Project membership checks for `project/{projectId}/{fileId}`. Its Interface preserves existing acceptance semantics: it recognizes the shared name grammar, while Storage continues to enforce non-empty file IDs, valid Project IDs, and path containment.

Consumers:

- Project Storage formats and resolves Project Documents.
- Hocuspocus parses Project and file identity during authentication and persistence.
- Collaboration connection tracking extracts the Project identity.
- Project Events compare parsed Project identity instead of string prefixes.

The previous `toDocumentName` formatter is shallow by the deletion test. The new Module earns its place because deleting it would duplicate identity grammar across four consumers.

### Project Access Policy

**Location:** `backend/src/projects/access-policy.ts`

The Module owns Project permissions for `read`, `write`, and `manage-collaborators`. Its Interface accepts Project ID, user ID, and intent, and returns the existing Project Access data only when that intent is allowed. HTTP and Hocuspocus remain Adapters for their own error forms.

Owner, read-write collaborator, read-only collaborator, outsider, and missing-Project behavior must remain unchanged. Project deletion keeps its existing owner-scoped SQL behavior because its current 404 response differs from other access failures.

### Collaborator Membership

**Location:** `backend/src/projects/collaborator-membership.ts`

The Module owns collaborator lookup, duplicate detection, mutation, and live connection invalidation. It returns explicit outcomes that the HTTP Adapter maps to the existing messages and status codes. Updating an unchanged read-only flag does not close connections; changing it does. Removing Membership closes the affected user's Project connections.

The persistence Implementation uses separate internal shapes for:

- Membership detail: Project ID, user ID, read-only flag, creation date.
- Project collaborator list: Membership detail plus user and Project display fields.

This removes the current mismatch where the detail query is mapped to a type that claims joined fields it did not select.

### Project Content

**Location:** `backend/src/projects/project-content.ts`

The Module owns file and folder mutations plus the required Project Event. Its Interface exposes named Project operations rather than one generic command dispatcher. Each operation hides normalization or Storage mechanics and emits `files-changed` only after a successful mutation.

Covered operations:

- Create an editable file.
- Create a folder.
- Upload editable content or a binary asset.
- Rename or move a file.
- Rename a folder.
- Delete a file or folder.

Project Access remains a distinct deep Module. The HTTP Adapter performs one intent check before calling Project Content so transport-specific 403 responses remain byte-for-byte stable.

### Project Storage

**Location:** `backend/src/projects/storage.ts`

The existing `collab/files.ts` Implementation moves here and remains one cohesive Module. It is not split into one file per filesystem function. Its Interface no longer exposes absolute paths.

The Module directly provides the behaviors its consumers need:

- Project Content listing and mutation.
- Project Document text and binary persistence.
- ZIP streaming.
- Asset byte reads for Gotenberg.
- Asset read streams for HTTP downloads.

Path containment, missing-file detection, `.yjs` companion handling, and root-directory configuration stay private Implementation. `helpers/file-exists.ts` is folded into this Implementation because it has one consumer and is shallow by the deletion test.

No filesystem Adapter abstraction is introduced. There is only one Adapter today, so a new Seam would be hypothetical.

## HTTP Adapter structure

`backend/src/routes/api/projects.ts` becomes a small composition Module that mounts focused route Adapters:

- `backend/src/routes/api/projects/project-routes.ts`: list, create, read, rename, and delete Project metadata.
- `backend/src/routes/api/projects/collaborator-routes.ts`: list and mutate Collaborator Membership.
- `backend/src/routes/api/projects/content-routes.ts`: list, create, upload, download, rename, move, and delete Project Content.
- `backend/src/routes/api/projects/export-routes.ts`: ZIP and PDF export.
- `backend/src/routes/api/projects/schemas.ts`: the existing Zod request validation and exact messages.

The route Adapters continue to own:

- Hono request and response objects.
- Parsing route parameters and bodies.
- Exact HTTP status, headers, and message mapping.
- Stream cancellation tied to the client request.

They do not own filesystem paths, collaboration broadcasts, Membership side effects, or permission interpretation.

## Data flow

### Project Content mutation

1. The HTTP Adapter parses and validates the request with the existing Zod rules.
2. Project Access Policy authorizes the user for `write`.
3. Project Content performs the Storage mutation.
4. Project Content publishes a Project Event after success.
5. The HTTP Adapter maps the result to the existing response.

No Project Event is published after a rejected or failed mutation.

### Collaborator Membership mutation

1. The HTTP Adapter parses the request.
2. Collaborator Membership authorizes `manage-collaborators` through Project Access Policy.
3. The Module resolves the target user or Membership and applies the persistence mutation.
4. A changed permission or removed Membership invalidates affected live connections.
5. The HTTP Adapter maps the outcome to the existing response.

### Project Document collaboration

1. Hocuspocus parses the Project Document through Project Document Identity.
2. Project Access Policy authorizes `read` and supplies the existing read-only value.
3. Project Storage loads or persists text and `.yjs` state.
4. Connection tracking uses the same Project Document Identity Module.

## Error handling

HTTP error text and status remain Adapter responsibilities. Deep Modules return typed outcomes for expected failures and throw only for the same unexpected filesystem, database, or external failures that currently escape to the global error handler.

Storage preserves the current distinction between:

- Invalid paths returning `null` or `false` where callers already expect them.
- Missing content returning `undefined`.
- Invalid write targets throwing an error.
- Unexpected filesystem errors propagating.

Characterization Tests lock these distinctions before Implementation moves.

## Testing strategy

### Characterization Tests before movement

- Expand Project route tests across owner, read-write, read-only, outsider, and unauthenticated access.
- Capture exact response bodies and status codes for representative Project, Collaborator Membership, Project Content, ZIP, and PDF requests.
- Capture Project Event behavior for successful and rejected content mutations.
- Capture connection invalidation for changed, unchanged, and removed Membership.
- Add Project Document Identity roundtrip and invalid-name cases.
- Add PDF rendering and Gotenberg request Characterization Tests without redesigning the workflow.

### Module tests during movement

- Test Project Access Policy through its intent-based Interface.
- Test Collaborator Membership through complete mutation-plus-invalidation sequences.
- Keep the existing 48 Project Storage tests and move them with the Module.
- Add missing ZIP, asset read, and `.yjs` move coverage.
- Test Project Content through mutation-plus-Project-Event behavior.

### Final verification

Run:

- `pnpm --filter server test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`

The earlier backend test invocation did not terminate during observation. If that recurs, diagnose the open handle separately and report the exact verification status rather than claiming a green baseline.

## Implementation order

1. Establish Characterization Tests and reusable route-test fixtures.
2. Introduce Project Document Identity and migrate its four consumers.
3. Introduce Project Access Policy and migrate HTTP/Hocuspocus callers.
4. Correct Membership persistence shapes and introduce Collaborator Membership.
5. Move and deepen Project Storage without changing filesystem layout.
6. Introduce Project Content and move mutation-plus-event workflows.
7. Split `projects.ts` into focused HTTP Adapters.
8. Add PDF Characterization Tests only.
9. Run complete verification and present the uncommitted diff.

## Review surface

All work remains unstaged and uncommitted. The user reviews `git diff`, new files, and verification output before deciding whether to keep, revise, stage, or commit anything.
