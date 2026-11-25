import fs from "node:fs";
import git from "isomorphic-git";

export const PROJECT_GIT_REMOTE = "origin";

export type GitAuthor = {
	name: string;
	email: string;
};

/** Pass full branch refs to isomorphic-git so it writes under refs/heads. */
export function branchRef(branch: string): string {
	return `refs/heads/${branch}`;
}

export function remoteBranchRef(branch: string): string {
	return `refs/remotes/${PROJECT_GIT_REMOTE}/${branch}`;
}

export async function configureBranchTracking(dir: string, branch: string): Promise<void> {
	await git.setConfig({ fs, dir, path: `branch.${branch}.remote`, value: PROJECT_GIT_REMOTE });
	await git.setConfig({ fs, dir, path: `branch.${branch}.merge`, value: branchRef(branch) });
}
