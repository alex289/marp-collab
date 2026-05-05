# Realtime Collaboration App

Fullstack starter for a collaborative Monaco editor.

## Stack

- Frontend: Vite, React, shadcn/ui, Monaco, Yjs
- Backend: Hono, Better Auth, Drizzle ORM, SQLite
- Realtime transport: WebSocket endpoint at `/yjs/<room>`

## Project Structure

- `frontend` React app with the collaborative editor UI.
- `backend` Hono API, Better Auth handlers, Drizzle schema, and Yjs websocket upgrade handling.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure backend env:

```bash
cp backend/.env.example backend/.env
```

3. Initialize the SQLite schema once (optional, it also runs automatically on backend start):

```bash
npm run db:init
```

4. Start frontend and backend together:

```bash
npm run dev
```

Open the app at `http://localhost:5173`.

## Scripts

- `npm run dev` start backend + frontend
- `npm run build` build both apps
- `npm run typecheck` run TypeScript checks for both apps
- `npm run db:init` create auth tables in SQLite (idempotent)
- `npm run db:generate` alias for `db:init`
- `npm run db:migrate` alias for `db:init`

## Environment Variables

Backend (`backend/.env`):

- `PORT` backend port (default `3000`)
- `CORS_ORIGIN` frontend origin for CORS (default `http://localhost:5173`)
- `BETTER_AUTH_URL` backend public URL used by Better Auth
- `BETTER_AUTH_SECRET` secret used for signing auth artifacts
- `DATABASE_URL` SQLite file path (default `./sqlite.db`)

Frontend (`frontend/.env` optional):

- `VITE_API_BASE_URL` API base URL (default `http://localhost:3000`)
- `VITE_WS_BASE_URL` websocket base URL (default `ws://localhost:3000/yjs`)
