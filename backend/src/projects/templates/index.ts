import { defaultTemplate } from "./default.ts";
import type { ProjectTemplate } from "./types.ts";
import { whsTemplate } from "./whs.ts";

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [defaultTemplate, whsTemplate];

export const PROJECT_TEMPLATE_IDS = PROJECT_TEMPLATES.map((template) => template.id) as [
	string,
	...string[],
];

export function isProjectTemplateId(value: string): boolean {
	return PROJECT_TEMPLATES.some((template) => template.id === value);
}

export function getProjectTemplate(id: string): ProjectTemplate {
	return PROJECT_TEMPLATES.find((template) => template.id === id) ?? defaultTemplate;
}

export type { ProjectTemplate };
