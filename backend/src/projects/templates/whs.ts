import { escapeHtml, escapeYaml, escapeYamlValue } from "./escape.ts";
import type { ProjectTemplate } from "./types.ts";

export const whsTemplate: ProjectTemplate = {
	id: "whs",
	label: "WHS",
	themeFiles: ["theme.css", "whs-logo.svg", "inter.woff2", "jetbrains-mono.woff2"],
	createMarkdown: (title, author) => `---
marp: true
size: 16:9
fragmented: false
title: ${escapeYaml(title)}
description: A Marp presentation with the Westfälische Hochschule theme
keywords: "Presentation, ${escapeYamlValue(title)}"
author: ${escapeYaml(author)}
theme: whs
paginate: true
header: "![](theme/whs-logo.svg)"
---

<!-- _class: title-page -->

<!-- Name -->

<!--
- Bei Fragen gerne reinrufen
-->

<div class="title">${escapeHtml(title)}</div>
<div class="subtitle">A subtitle ...</div>
<div class="author">${escapeHtml(author)}, ...</div>
<div class="date">??.??.????</div>
<div class="module">Kurs ?? im Semester ??</div>
<div class="lector">Prof. ????????</div>

---

<!-- Name -->

# Inhaltsverzeichnis

1. Einleitung
2. Planung und Architektur
3. Implementierung
4. Qualitätssicherung
5. Dokumentation
6. Demo
7. Fazit

`,
};
