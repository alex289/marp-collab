import type { ProjectTemplateId } from "../../../shared/project-templates.ts";
import { closeProjectDocuments } from "../collab/project-events.ts";
import {
	deleteProject,
	getProjectById,
	getProjectsByOwnerId,
	updateProject,
} from "../db/models/project.ts";
import {
	getCollaborationsByUserId,
	getCollaboratorsByProjectId,
} from "../db/models/project-collaborator.ts";
import { getUserById } from "../db/models/user.ts";
import { getProjectAuthorization } from "../projects/access-policy.ts";
import { isProjectGitConfigured } from "../projects/git-sync.ts";
import { listProjectContent } from "../projects/project-content.ts";
import {
	beginProjectRepositoryOperation,
	withProjectContentMutation,
} from "../projects/project-operations.ts";
import { provisionProjectFromTemplate } from "../projects/project-provisioning.ts";
import { deleteProjectDirectory } from "../projects/storage.ts";
import { PresentationToolError } from "./presentations.ts";

function requireProjectOwnerAccess(projectId: string, userId: string): void {
	const authorization = getProjectAuthorization(projectId, userId, "manage");
	if (!authorization.allowed) {
		throw new PresentationToolError(
			authorization.reason === "not-owner"
				? "Only the project owner can manage this project."
				: "Project not found or access denied.",
		);
	}
}

export async function listProjects(userId: string) {
	const entries = [
		...getProjectsByOwnerId(userId).map((project) => ({
			id: project.id,
			name: project.name,
			isOwner: true,
			readOnly: false,
			createdAt: project.createdAt.toISOString(),
			updatedAt: project.updatedAt.toISOString(),
		})),
		...getCollaborationsByUserId(userId).map((project) => ({
			id: project.projectId,
			name: project.projectName,
			isOwner: false,
			readOnly: project.readOnly,
			createdAt: project.projectCreatedAt.toISOString(),
			updatedAt: project.updatedAt.toISOString(),
		})),
	];
	const projects = await Promise.all(
		entries.map(async (project) => ({
			...project,
			gitConfigured: await isProjectGitConfigured(project.id),
		})),
	);
	return { projects };
}

export async function createPresentationProject(
	userId: string,
	name: string,
	template: ProjectTemplateId,
) {
	const user = getUserById(userId);
	if (!user) {
		throw new PresentationToolError("User not found.");
	}
	const projectId = await provisionProjectFromTemplate(
		{ name, ownerId: userId },
		template,
		user.name || "Unknown Author",
	);
	const files = await listProjectContent(projectId);
	return { id: projectId, name, template, files };
}

export function renamePresentationProject(projectId: string, userId: string, name: string) {
	requireProjectOwnerAccess(projectId, userId);
	updateProject({ id: projectId, name });
	return { id: projectId, name };
}

export async function deletePresentationProject(
	projectId: string,
	userId: string,
	dryRun: boolean,
	confirmName?: string,
) {
	requireProjectOwnerAccess(projectId, userId);
	const project = getProjectById(projectId);
	if (!project) {
		throw new PresentationToolError("Project not found or access denied.");
	}
	if (dryRun) {
		const [files, gitConfigured] = await Promise.all([
			listProjectContent(projectId),
			isProjectGitConfigured(projectId),
		]);
		const collaboratorCount = getCollaboratorsByProjectId(projectId).length;
		requireProjectOwnerAccess(projectId, userId);
		return {
			id: projectId,
			name: project.name,
			fileCount: files.filter((entry) => entry.type !== "folder").length,
			collaboratorCount,
			gitConfigured,
			deleted: false,
		};
	}
	if (confirmName !== project.name) {
		throw new PresentationToolError(
			"Pass confirmName matching the project's exact name to permanently delete it, or set dryRun to true to inspect what will be deleted.",
		);
	}
	const release = beginProjectRepositoryOperation(projectId);
	if (!release) {
		throw new PresentationToolError(
			"Project is syncing with Git or being modified. Try again shortly.",
		);
	}
	try {
		return await withProjectContentMutation(projectId, async () => {
			requireProjectOwnerAccess(projectId, userId);
			const current = getProjectById(projectId);
			if (!current) {
				throw new PresentationToolError("Project not found or access denied.");
			}
			if (confirmName !== current.name) {
				throw new PresentationToolError(
					"Project was renamed. Review the current name and try again.",
				);
			}
			const deleteResult = deleteProject(projectId, userId);
			if (deleteResult.changes === 0) {
				throw new PresentationToolError("Project not found or access denied.");
			}
			await deleteProjectDirectory(projectId);
			closeProjectDocuments(projectId);
			return { id: projectId, name: current.name, deleted: true };
		});
	} finally {
		release();
	}
}
