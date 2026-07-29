# <div align="center"><img src="https://raw.githubusercontent.com/alex289/marp-collab/refs/heads/main/frontend/public/pwa-192x192.png" width="100"/> <br>MarpCollab</div>

<div align="center">
Realtime collaboration editor for marp presentations<br><br>

<a href="https://github.com/alex289/marp-collab/blob/main/LICENSE"><img alt="GitHub License" src="https://img.shields.io/github/license/alex289/marp-collab"></a>
<a href="https://github.com/alex289/marp-collab/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/alex289/marp-collab"></a>
<a href="https://github.com/alex289/marp-collab/issues"><img alt="GitHub Issues" src="https://img.shields.io/github/issues/alex289/marp-collab"></a>
</div>

MarpCollab is a realtime collaboration editor for [Marp](https://marp.app/) presentations. It allows multiple users to edit the same presentation simultaneously, with changes reflected in real-time.

## Getting Started

MarpCollab is self-hosted with Docker Compose. You need Docker with the Compose plugin and an OAuth provider to log in with.

1. Grab the [`docker-compose.yml`](https://github.com/alex289/marp-collab/blob/main/docker-compose.yml) into an empty directory:

   ```sh
   mkdir marp-collab && cd marp-collab
   curl -O https://raw.githubusercontent.com/alex289/marp-collab/refs/heads/main/docker-compose.yml
   ```

2. Create a `.env` file next to it (See [Configuration](#configuration) for all available settings)

3. Start it:

   ```sh
   docker compose up -d
   ```

The app is available at http://localhost:8787. The database and all project files live in `./data`, so back up that directory. The bundled `gotenberg` service handles PDF export and needs no configuration.

To update, pull the new image and recreate the containers:

```sh
docker compose pull && docker compose up -d
```

> [!NOTE]
> The port is published on `127.0.0.1` only. To expose MarpCollab publicly, put it behind a reverse proxy that terminates TLS and set `URL` to the public address.

### Configuration

All settings are configured via environment variables.

#### Basic

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

#### Advanced

These settings are not required to be set, but can be used to customize the app's behavior.

| Variable           | Default            | Description                                                                                  |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------- |
| `PORT`             | `8787`             | Port the HTTP server listens on.                                                             |
| `HOSTNAME`         | _(all interfaces)_ | Hostname/IP to bind the server to.                                                           |
| `NODE_ENV`         | —                  | Set to `development` to enable dev mode (disables static frontend serving).                  |
| `DATA_PATH`        | `./data`           | Directory for the SQLite database and all project files.                                     |
| `MAX_BODY_SIZE_MB` | `200`              | Maximum allowed HTTP request body size in megabytes. Increase for larger file/video uploads. |
| `LOG_LEVEL`        | `info`             | Log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).                              |

## Contribute

You're very welcome to contribute to MarpCollab! Please follow the [contribution guide](https://github.com/alex289/marp-collab/blob/main/CONTRIBUTING.md) to get started.
