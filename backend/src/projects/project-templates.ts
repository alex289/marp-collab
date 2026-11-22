import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toDocumentName } from "../../../shared/collaboration.ts";
import { DEFAULT_DECK_FILE, type ProjectTemplateId } from "../../../shared/project-templates.ts";
import { saveDocumentContent, saveProjectFile } from "./storage.ts";
import { projectTemplates } from "./templates/index.ts";

// Resolved from cwd, as this works during dev and when bundled in prod.
const templateAssetsDir = resolve(process.cwd(), "assets/templates");

export async function seedProjectFromTemplate(
	projectId: string,
	templateId: ProjectTemplateId,
	title: string,
	author: string,
): Promise<void> {
	const template = projectTemplates[templateId];

	await saveDocumentContent(
		toDocumentName(projectId, DEFAULT_DECK_FILE),
		template.createMarkdown(title, author),
	);

	for (const fileName of template.themeFiles) {
		const data = await readFile(resolve(templateAssetsDir, templateId, fileName));
		await saveProjectFile(projectId, `theme/${fileName}`, new Uint8Array(data));
	}
}
