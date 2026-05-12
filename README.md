# Realtime Marp Collaboration (MVP)

Stack:

- Backend: Hono, Better Auth, Hocuspocus, Yjs, TypeScript
- Frontend: Vite, React, CodeMirror 6, Shadcn-style UI, Marp Core

## 1) Backend starten

```bash
cd apps/server
cp .env.example .env
npm install
npm run dev
```

Backend URLs:

- HTTP API: http://localhost:8787
- WebSocket (Hocuspocus): ws://localhost:1234

## 2) Frontend starten

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Frontend URL:

- http://localhost:5173

## Features

- Better Auth Email/Passwort Login/Signup
- Dateisidebar links
- Kollaborativer CodeMirror 6 Editor in der Mitte
- Live Marp Preview rechts
- Presence via Yjs Awareness (Userfarbe + Teilnehmerliste)

## Hinweise

- Die Dokumente werden im Backend im Speicher gehalten (MVP, keine dauerhafte Dateispeicherung).
- Auth-Daten liegen in SQLite unter apps/server/data/auth.sqlite.
