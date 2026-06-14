---
marp: true
size: 16:9
fragmented: false
title: Presentation Frameworks Abschlusspräsentation
description: Abschlusspräsentation für das Modul Presentation Frameworks im Sommersemester 2026
keywords: Marp, whs, presentation
author: Timo Kössler, Alexander Konietzko, Maxim Bigler
theme: whs
paginate: true
header: "![](theme/whs-logo.svg)"
---

<!-- _class: title-page -->

<div class="title">PFW Abschlusspräsentation</div>
<div class="subtitle"></div>
<div class="author">Timo Kössler, Alexander Konietzko, Maxim Bigler</div>
<div class="date">15.06.2026</div>
<div class="module">Presentation Frameworks SS26</div>
<div class="lector">Prof. Dr. Martin Guddat</div>

---

# Motivation & Problemstellung

- Powerpoint nicht deterministisch
- Alternativen existieren (Marp), aber
  - ohne kollaboratives Arbeiten
  - ohne eigenen Editor
  - ohne Verwaltung von Projekten und Projektdaten

---

# Projektziele

1. Funktionalen Editor für Präsentation mit Preview
2. Kollaboratives Arbeiten an Präsentationen
3. Verwaltung von Projekten und Projektdaten
4. Umfangreicher Präsentationsmodus

---

# Systemarchitektur

- Monorepo
- Yjs

---

# Tech Stack

Backend:

- Better-Auth
- Hono
- Hocuspocus

---

# Tech Stack

Frontend:

- Tanstack Router
- React
- Vite
- ShadcnUI / Tailwind CSS
- Codemirror

---

# Datenbank und Storage

- Sqlite
- Dateisystem

---

# Optimierungen

- Accessibility
- Progressive Web App
- Responsive Design

---

# Qualitätssicherung

- Linting: Oxlint
- Formatting: Oxfmt
- Type checking

---

# Tests

- E2E Tests: Playwright

---

# Deployment & DevOps

- Docker Compose
- Single Container Deployment
- CI/CD mit GitHub Actions
- Manuelles Deployment

---

# Demo

---

# Lessons Learned

- Nutzung von KI-Tools

---

# Ausblick

---

<!-- _class: title-page -->

<div class="title">PFW Abschlusspräsentation</div>
<div class="subtitle"></div>
<div class="author">Timo Kössler, Alexander Konietzko, Maxim Bigler</div>
<div class="date">15.06.2026</div>
<div class="module">Presentation Frameworks SS26</div>
<div class="lector">Prof. Dr. Martin Guddat</div>
