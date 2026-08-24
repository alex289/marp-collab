const syncingProjects = new Set<string>();

export function startProjectGitSync(projectId: string): boolean {
	if (syncingProjects.has(projectId)) {
		return false;
	}
	syncingProjects.add(projectId);
	return true;
}

export function finishProjectGitSync(projectId: string): void {
	syncingProjects.delete(projectId);
}

export function isProjectGitSyncing(projectId: string): boolean {
	return syncingProjects.has(projectId);
}
