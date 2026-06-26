# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm workspace for a collaborative Marp editor. Main app code lives in `frontend/` and `backend/`; Playwright coverage is in `e2e/`; shared demo/presentation material is in `presentation/`; personal notes are in `journal/`.

- `frontend/src/`: React 19, Vite, TanStack Router, CodeMirror, shadcn-style UI components, hooks, and route files.
- `backend/src/`: Hono API, Better Auth configuration, Yjs/Hocuspocus collaboration code, SQLite models, migrations, and helpers.
- `e2e/tests/`: browser integration and security-oriented tests. Setup state is created by `auth.setup.ts`.

## Build, Test, and Development Commands

Use Node `>=24` and pnpm `11.7.0`.

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run frontend and backend dev servers in parallel.
- `pnpm build`: build all workspace packages.
- `pnpm typecheck`: run TypeScript checks for each package.
- `pnpm lint`: run type-aware Oxlint with warnings denied.
- `pnpm format` / `pnpm format:check`: write or verify Oxfmt formatting.
- `pnpm --filter server test`: run backend unit tests with Node's built-in test runner.
- `pnpm --filter e2e test`: run Playwright tests; this starts the Docker e2e stack from `e2e/docker-compose.e2e.yml`.

For local manual startup, copy `backend/.env.example` to `backend/.env`, then run `pnpm --filter server dev` and `pnpm --filter vite-app dev`.

## Coding Style & Naming Conventions

Write TypeScript as ESM. Follow the existing tab-indented style and let Oxfmt make final formatting decisions. Use kebab-case for route/component filenames such as `file-sidebar.tsx`, and prefer named exports for reusable helpers. Keep backend modules grouped by domain: routes in `backend/src/routes/`, database code in `backend/src/db/`, and collaboration logic in `backend/src/collab/`.

## Testing Guidelines

Place backend unit tests next to the code under test as `*.test.ts`. Keep Playwright specs in `e2e/tests/*.test.ts`; use `*.setup.ts` only for test state setup. Run `pnpm typecheck`, `pnpm lint`, and the relevant test command before opening a PR.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits such as `feat: Add danger zone` and `fix: Formatting`. Keep subjects imperative and scoped to one change. PRs should include a short summary, test results, linked issues when applicable, and screenshots or screen recordings for visible UI changes.

## Security & Configuration Tips

Do not commit `.env` files, local databases, Playwright auth state, or generated build output. Treat uploaded file handling and project authorization paths as security-sensitive; update or add tests when changing `backend/src/helpers/file-allowlist.ts`, `backend/src/helpers/project-auth.ts`, or auth-related routes.
