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

| Tool                                                 | What it does                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_projects`, `list_files`                        | Discover accessible projects (with ownership, write access, Git connection status, and timestamps), files, folders, and assets.                                                                                                      |
| `create_project`, `rename_project`, `delete_project` | Create a project from a template (`default` or `whs`), rename an owned project, or permanently delete an owned project (use `dryRun: true` to inspect first and pass `confirmName` matching the exact project name).                 |
| `read_file`, `create_file`, `edit_file`              | Work with Markdown and CSS. Reads include live edits. Pass the returned `revision` as `expectedRevision` when editing. Creation rejects an existing file.                                                                            |
| `create_folder`                                      | Create a folder and any missing parents.                                                                                                                                                                                             |
| `move_entry`                                         | Move or rename a file or folder. Supply its current `path` and full new `destination` within the project. The destination's parent must exist. Files keep their extensions, and moves reject existing destinations.                  |
| `delete_entry`                                       | Delete a file or empty folder. Use `dryRun: true` to list affected project paths. Use `recursive: true` to delete a non-empty folder.                                                                                                |
| `upload_asset`                                       | Create an image, font, or video from standard `base64` data up to 2 MiB. The path must use an extension supported by the app.                                                                                                        |
| `check_references`                                   | Report local Markdown includes, images, and CSS URLs. Pass an entry's `path` to see references to or from it before moving or deleting it.                                                                                           |
| `preview_presentation`                               | Render the current Markdown with includes and themes, returning slide count and issues. Pass `slides` (1-based numbers, up to 5) and optional `format` (`png`, `jpeg`, `webp`) to render visual slide images via Gotenberg Chromium. |
| `pull_from_git`, `push_to_git`                       | Synchronize a project with its connected Git repository.                                                                                                                                                                             |

Existing clients can continue using `read_presentation`, `create_presentation`,
and `edit_presentation` for Markdown. The server also exposes a Marp authoring
guide.

The OAuth scopes are `presentations:read`, `presentations:write`, and optional
`offline_access` for refresh tokens. Project, file, folder, and Git mutations
require the write scope. Renaming or deleting a project requires owning it;
file, folder, and Git operations require current project write access. Read-only
tokens expose listing, text reads, and diagnostics. Collaborator management and
connecting Git repositories are available through the app.

Include paths resolve relative to the file containing the directive. Both
checks resolve images in expanded Markdown relative to the deck being rendered. Check references again after moves or deletions and
update links in the affected files. By default, `preview_presentation` runs a fast server-side Marp check without a browser or remote URL
fetches. When `slides` are requested, Gotenberg renders those slides in headless Chromium using the same strict Content-Security-Policy and
local asset bundling as PDF export, returning images so multimodal AI clients can inspect layout, overflow, and styling.

When the project owner has connected a Git repository in the app, the assistant can
pull remote changes and push commits with its own one-line commit message, for
example after each finished chapter. Each sync briefly reconnects everyone editing
the project. Pulls report conflicting paths so the assistant can ask which
version to keep and pull again with a resolution per path. Pushes are rejected while
the remote has newer changes; the assistant then pulls with its commit message, so the
pending edits are committed under that message, and pushes again. The Git tools need the `presentations:write` scope and
write access to the project; connecting or changing the repository stays in the app.

Edits synchronize with open editors. Stale revisions are rejected so the
assistant can reread and reapply its changes. OAuth and signing key tables are
added automatically by the database migration on startup.

Reverse proxies must forward `/mcp`, `/.well-known/*`, and `/api/v1/auth/*` to the
backend. The development Vite proxy already forwards these paths. MCP requests use
OAuth access tokens; existing browser API routes continue to require session cookies.

Implementation follows the [Better Auth MCP integration](https://better-auth.com/docs/plugins/mcp)
and the [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/).
