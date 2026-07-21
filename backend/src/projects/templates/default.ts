import type { ProjectTemplate } from "./types.ts";

export const defaultTemplate: ProjectTemplate = {
	id: "default",
	label: "Default",
	themeFiles: [],
	createMarkdown: (title, author) => `---
marp: true
size: 16:9
title: ${title}
description: A Marp presentation
keywords: Presentation, ${title}
author: ${author}
theme: default
paginate: true
---

# ${title}

---

## Slide 2
`,
};
