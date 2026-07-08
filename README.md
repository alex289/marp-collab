# Marp Collab

## Projektidee & Motivation

Marp-Collab ist eine WebApp für Marp, die es ermöglicht, Präsentationen in Echtzeit mit mehreren Personen zu erstellen und zu bearbeiten. Die Idee entstand aus der Notwendigkeit, während der Erstellung von Präsentationen effektiver zusammenzuarbeiten und Feedback in Echtzeit zu erhalten.

## Technologien

- Backend: Hono, Better Auth, Hocuspocus, Yjs, TypeScript
- Frontend: Vite, React, CodeMirror 6, Shadcn, Marp Core

## Lernziele

- Entwicklung einer Echtzeit-Kollaborationsplattform
- Integration von Marp in eine kollaborative Umgebung
- Verbesserung der Fähigkeiten in TypeScript, React und Backend-Entwicklung

## Getting Started

## 1. Backend starten

```bash
pnpm install
cd backend
cp .env.example .env
pnpm dev
```

## 2. Frontend starten

```bash
cd frontend
pnpm dev
```

## Configuration

All settings are configured via environment variables.

### Basic

| Variable      | Default | Description                                                                                                       |
| ------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `URL`         | —       | Public base URL of the app (e.g. `https://example.com`). Used by Better Auth as the trusted origin. **Required.** |
| `AUTH_SECRET` | —       | Random secret used by Better Auth to sign sessions. **Required.**                                                 |

At least one OAuth provider must be configured. Each provider is identified by a numeric index `<n>` starting at `0`:

| Variable                          | Default                | Description                                                            |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `AUTH_PROVIDER_<n>_NAME`          | —                      | Display name shown on the login page. **Required.**                    |
| `AUTH_PROVIDER_<n>_CLIENT_ID`     | —                      | OAuth client ID. **Required.**                                         |
| `AUTH_PROVIDER_<n>_CLIENT_SECRET` | —                      | OAuth client secret. **Required.**                                     |
| `AUTH_PROVIDER_<n>_DISCOVERY_URL` | —                      | OIDC discovery URL (`.well-known/openid-configuration`). **Required.** |
| `AUTH_PROVIDER_<n>_SCOPES`        | `openid,email,profile` | Comma-separated OAuth scopes.                                          |

### Advanced

These settings are not required to be set, but can be used to customize the app's behavior.

| Variable           | Default            | Description                                                                                  |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------- |
| `PORT`             | `8787`             | Port the HTTP server listens on.                                                             |
| `HOSTNAME`         | _(all interfaces)_ | Hostname/IP to bind the server to.                                                           |
| `NODE_ENV`         | —                  | Set to `development` to enable dev mode (disables static frontend serving).                  |
| `DATA_PATH`        | `./data`           | Directory for the SQLite database and all project files.                                     |
| `MAX_BODY_SIZE_MB` | `200`              | Maximum allowed HTTP request body size in megabytes. Increase for larger file/video uploads. |
| `LOG_LEVEL`        | `info`             | Log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).                              |
