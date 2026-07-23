import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toDocumentName } from "./document-identity.ts";
import { saveDocumentContent, saveProjectFile } from "./storage.ts";
import { getProjectTemplate } from "./templates/index.ts";

// Resolved from cwd, as this works during dev and when bundled in prod.
const templateAssetsDir = resolve(process.cwd(), "assets/templates");

export async function seedProjectFromTemplate(
	projectId: string,
	templateId: string,
	title: string,
	author: string,
): Promise<void> {
	const template = getProjectTemplate(templateId);

	await saveDocumentContent(
		toDocumentName(projectId, "presentation.md"),
		template.createMarkdown(title, author),
	);

	if (template.themeFiles) {
		for (const fileName of template.themeFiles) {
			const data = await readFile(resolve(templateAssetsDir, template.id, fileName));
			await saveProjectFile(projectId, `theme/${fileName}`, new Uint8Array(data));
		}
	}
}
