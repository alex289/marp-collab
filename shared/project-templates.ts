export const PROJECT_TEMPLATE_IDS = ["default", "whs"] as const;
export type ProjectTemplateId = (typeof PROJECT_TEMPLATE_IDS)[number];
export const DEFAULT_PROJECT_TEMPLATE: ProjectTemplateId = "default";
export const DEFAULT_DECK_FILE = "presentation.md";
