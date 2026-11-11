---
"marp-collab": patch
---

Update dependencies and tooling, and migrate OAuth login to Better Auth 1.7. OAuth providers must use `/api/v1/auth/callback/<n>` as the redirect URI in place of `/api/v1/auth/oauth2/callback/<n>`.

Migrate PDF export to Gotenberg 9. Custom deployments must upgrade the PDF service alongside the app.
