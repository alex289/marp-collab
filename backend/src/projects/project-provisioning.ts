import { randomUUID } from "node:crypto";
import type { ProjectTemplateId } from "../../../shared/project-templates.ts";
import { createProject, type Project } from "../db/models/project.ts";
import { logger } from "../helpers/logger.ts";
import { importProjectFromZip } from "./project-import.ts";
import { seedProjectFromTemplate } from "./project-templates.ts";
import { commitStagedProjectDirectory, deleteProjectDirectory } from "./storage.ts";

type NewProject = Pick<Project, "name" | "ownerId">;

async function provisionProject(
	project: NewProject,
	initializeContent: (stagingId: string) => Promise<unknown>,
): Promise<string> {
	const projectId = randomUUID();
	const stagingId = `staging-${projectId}`;
	let directoryId = stagingId;
	try {
		await initializeContent(stagingId);
		await commitStagedProjectDirectory(stagingId, projectId);
		directoryId = projectId;
		createProject({ ...project, id: projectId });
		return projectId;
	} catch (error) {
		try {
			await deleteProjectDirectory(directoryId);
		} catch (cleanupError) {
			logger.error({ err: cleanupError, directoryId }, "Failed to clean up unpublished project");
		}
		throw error;
	}
}

export function provisionProjectFromTemplate(
	project: NewProject,
	template: ProjectTemplateId,
	author: string,
): Promise<string> {
	return provisionProject(project, (stagingId) =>
		seedProjectFromTemplate(stagingId, template, project.name, author),
	);
}

export function provisionProjectFromZip(project: NewProject, zipData: Uint8Array): Promise<string> {
	return provisionProject(project, (stagingId) => importProjectFromZip(stagingId, zipData));
}
