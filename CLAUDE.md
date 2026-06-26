# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Marp-Collab** is a real-time collaborative Marp presentation editor. Multiple users can co-edit Markdown slides simultaneously, with live preview and a presentation mode with synchronized slide navigation.

## Tech Stack

- **Backend**: Hono (HTTP), Hocuspocus (WebSocket/CRDT), Yjs (document sync), Better Auth (OAuth), better-sqlite3, Pino (logging)
- **Frontend**: React 19, Vite, TanStack Router (file-based routing), CodeMirror 6, Marp Core, Shadcn/Radix UI, Tailwind CSS v4, SWR
- **Tooling**: pnpm workspaces, oxlint, oxfmt, Rolldown (backend bundler), Playwright (e2e)

## Commands

All commands run from the repo root unless noted.

```bash
# Development (runs frontend + backend in parallel)
pnpm dev

# Individual workspaces
cd backend && pnpm dev   # Node --watch, reads backend/.env
cd frontend && pnpm dev  # Vite dev server

# Build
pnpm build               # builds both workspaces

# Type checking
pnpm typecheck           # runs tsc --noEmit in all workspaces

# Linting & formatting
pnpm lint                # oxlint with type-aware rules (deny-warnings)
pnpm format              # oxfmt --write
pnpm format:check        # oxfmt --check (CI)

# Backend tests (Node built-in test runner)
cd backend && pnpm test  # node --test src/**/*.test.ts

# E2E tests (Playwright — spins up Docker)
cd e2e && pnpm test
cd e2e && pnpm test:ui   # headed + UI mode
```

## Backend Architecture

The backend is a single Hono app (`backend/src/app.ts`) that handles:

1. **HTTP REST API** at `/api/v1` — projects CRUD, file management, auth, health
2. **WebSocket collab** at `/api/v1/collab` — Hocuspocus upgrades the WS connection

**Auth**: Better Auth with configurable generic OAuth providers. Providers are loaded from env vars prefixed `AUTH_PROVIDER_<id>_*` (NAME, CLIENT_ID, CLIENT_SECRET, DISCOVERY_URL, SCOPES). All `/api/*` routes except `/auth/`, `/health`, and `/auth-providers` require a session cookie.

**Collab document naming**: Documents follow the pattern `project/<projectId>/<fileId>`. Only files with editable extensions (`.md`, `.markdown`, `.css`) open over WebSocket. Hocuspocus authenticates the WS connection by checking the session and project access rights.

**Persistence**: Each Yjs document is stored as:
- `<DATA_PATH>/presentations/<projectId>/<fileId>` — plain text (authoritative source for non-collab reads)
- `<DATA_PATH>/presentations/<projectId>/<fileId>.yjs` — binary Yjs state (loaded preferentially to restore CRDT history)

**Database**: SQLite at `<DATA_PATH>/db.sqlite`. Migrations run automatically on import from `backend/src/db/migrations/index.ts`. Models are in `backend/src/db/models/`.

**Authorization model**: Projects have an owner and optional collaborators (with `readOnly` flag). `getUserProjectAccess()` in `helpers/project-auth.ts` is the single source of truth for access checks.

## Frontend Architecture

**Routing**: TanStack Router with file-based routes under `frontend/src/routes/`. The route tree is auto-generated to `routeTree.gen.ts` — never edit this file manually.

- `/` — project list (index)
- `/login` — OAuth login
- `/presentations/$id` — the main editor view

**Editor route** (`routes/presentations/$id.tsx`) orchestrates:
- `useCollabDocument` — creates/destroys `HocuspocusProvider` + `Y.Doc` per selected file
- `useFiles` — SWR-fetched file tree for the project
- `EditorPane` — CodeMirror 6 with `y-codemirror.next` binding (lazy loaded)
- `PreviewPane` — renders Marp HTML from the live Yjs text (lazy loaded)
- `PresentationFrame` — full-screen slide view used in present/viewer modes
- `FileSidebar` — file tree, theme selector, search panel, outline panel

**Presentation sync**: When in `?mode=present`, the presenter's current slide index is broadcast via Yjs Awareness. Viewers (opened in a separate window via `?mode=viewer`) read awareness state and follow the presenter's slide.

**Theme system**: CSS files in a project are fetched and injected into Marp Core via `lib/marp.ts`. The active Marp theme directive is embedded in the Markdown frontmatter and managed by `lib/markdown-theme.ts`.

**Stateless messages**: The backend sends `"files-changed"` as a Hocuspocus stateless message to notify connected clients when the file tree changes (e.g., after upload or delete).

## Environment Variables (backend/.env)

```
PORT=8787
URL=http://localhost:5173          # used by Better Auth as the trusted origin
DATA_PATH=./data                   # SQLite DB + project files stored here
AUTH_SECRET=<random string>
NODE_ENV=development

# At least one OAuth provider required:
AUTH_PROVIDER_0_NAME=My Provider
AUTH_PROVIDER_0_CLIENT_ID=...
AUTH_PROVIDER_0_CLIENT_SECRET=...
AUTH_PROVIDER_0_DISCOVERY_URL=https://.../.well-known/openid-configuration
# AUTH_PROVIDER_0_SCOPES=openid,email,profile  (optional, defaults above)
```

## Production Deployment

In production (`NODE_ENV != development`), the Hono app serves the compiled frontend from `./frontend/` (relative to the backend's working directory). The Dockerfile builds both and places the frontend dist at `dist/frontend/`. Use `docker-compose.yml` for production or `docker-compose.dev.yml` for a quick containerized run.
