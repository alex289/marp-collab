# AI editing with MCP

Connect an MCP-compatible AI client to `${URL}/mcp` using Streamable HTTP. For local
development the URL is `http://localhost:5173/mcp`. Sign in with your usual provider
and approve the requested permissions. Public deployments require HTTPS and the
`URL` setting must match the address used by the client. No model API key is needed
in MarpCollab: the connected AI client generates the Markdown.

The server supports current MCP requests and stateless 2025 Streamable HTTP clients.
Clients can identify themselves with Client ID Metadata Documents (CIMD). For older
clients that require Dynamic Client Registration (DCR), explicitly set
`MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION=true` and restart. This opens client
registration to unauthenticated clients; accessing presentations still requires
user login and consent. Registration is disabled by default.

Available tools are `list_projects`, `list_files`, `read_presentation`,
`create_presentation`, `edit_presentation`, `pull_from_git`, and `push_to_git`. Create a project in the app first,
then ask your assistant, for example: “Create a ten-slide introduction to Kubernetes
in my Training project.” The server also exposes a Marp authoring guide.

The OAuth scopes are `presentations:read`, `presentations:write`, and optional
`offline_access` for refresh tokens. Request both presentation scopes to create or
edit decks; read-only tokens expose only the reading tools. Access covers owned and
shared projects and is checked against current project permissions on every call.
The server exposes no project deletion or collaborator-management tools.

When the project owner has connected a Git repository in the app, the assistant can
pull remote changes and push commits with its own commit message, for example after
each finished chapter. Pulls report conflicting paths so the assistant can ask which
version to keep and pull again with a resolution per path. Pushes are rejected while
the remote has newer changes. The Git tools need the `presentations:write` scope and
write access to the project; connecting or changing the repository stays in the app.

Edits synchronize with open editors and require the revision returned by
`read_presentation`. Stale revisions are rejected so the assistant can reread and
reapply its changes. New files never overwrite existing files. OAuth and signing
key tables are added automatically by the database migration on startup.

Reverse proxies must forward `/mcp`, `/.well-known/*`, and `/api/v1/auth/*` to the
backend. The development Vite proxy already forwards these paths. MCP requests use
OAuth access tokens; existing browser API routes continue to require session cookies.

Implementation follows the [Better Auth MCP integration](https://better-auth.com/docs/plugins/mcp)
and the [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/).
