import { defaultTemplate } from "./default.ts";
import type { ProjectTemplate } from "./types.ts";
import { whsTemplate } from "./whs.ts";
import type { ProjectTemplateId } from "../../../../shared/project-templates.ts";

export const projectTemplates: Record<ProjectTemplateId, ProjectTemplate> = {
	default: defaultTemplate,
	whs: whsTemplate,
};
