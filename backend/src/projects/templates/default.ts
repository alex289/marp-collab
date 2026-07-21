import { escapeHtml, escapeYaml, escapeYamlValue } from "./escape.ts";
import type { ProjectTemplate } from "./types.ts";

export const defaultTemplate: ProjectTemplate = {
	id: "default",
	label: "Default",
	themeFiles: [],
	createMarkdown: (title, author) => `---
marp: true
size: 16:9
title: ${escapeYaml(title)}
description: A Marp presentation
keywords: "Presentation, ${escapeYamlValue(title)}"
author: ${escapeYaml(author)}
theme: default
paginate: true
---

# ${escapeHtml(title)}

---

## Slide 2
`,
};
