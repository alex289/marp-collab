type ProjectOperations = {
	syncing: boolean;
	/** Settings changes touch only the Git repository, so they exclude syncs but not editing. */
	configuring: boolean;
	writers: number;
	drained: (() => void)[];
};
const projects = new Map<string, ProjectOperations>();

function operations(projectId: string): ProjectOperations {
	let state = projects.get(projectId);
	if (!state) {
		state = { syncing: false, configuring: false, writers: 0, drained: [] };
		projects.set(projectId, state);
	}
	return state;
}

function cleanup(projectId: string, state: ProjectOperations): void {
	if (!state.syncing && !state.configuring && state.writers === 0) {
		projects.delete(projectId);
	}
}

/** Reserve synchronization immediately, then drain previously admitted mutations. */
export function startProjectGitSync(projectId: string): boolean {
	const state = operations(projectId);
	if (state.syncing || state.configuring) {
		return false;
	}
	state.syncing = true;
	return true;
}

/** Reserve the project's Git repository for a settings change, without blocking editors. */
export function startProjectGitConfigure(projectId: string): boolean {
	const state = operations(projectId);
	if (state.syncing || state.configuring) {
		return false;
	}
	state.configuring = true;
	return true;
}

export function finishProjectGitConfigure(projectId: string): void {
	const state = projects.get(projectId);
	if (state) {
		state.configuring = false;
		cleanup(projectId, state);
	}
}

export function waitForProjectWrites(projectId: string): Promise<void> {
	const state = operations(projectId);
	return state.writers === 0
		? Promise.resolve()
		: new Promise((resolve) => state.drained.push(resolve));
}

export function finishProjectGitSync(projectId: string): void {
	const state = projects.get(projectId);
	if (state) {
		state.syncing = false;
		cleanup(projectId, state);
	}
}

export function isProjectGitSyncing(projectId: string): boolean {
	return projects.get(projectId)?.syncing ?? false;
}

/** Hold admission throughout asynchronous body parsing, document flushes and filesystem writes. */
export function beginProjectWrite(projectId: string): (() => void) | null {
	const state = operations(projectId);
	if (state.syncing) {
		return null;
	}
	state.writers++;
	let released = false;
	return () => {
		if (released) {
			return;
		}
		released = true;
		state.writers--;
		if (state.writers === 0) {
			for (const resolve of state.drained.splice(0)) {
				resolve();
			}
		}
		cleanup(projectId, state);
	};
}

/** Each Git operation runs processes that may each use up to GIT_TASK_LIMITS memory, so limit how many run at once. */
export const MAX_CONCURRENT_GIT_OPERATIONS = 4;
let runningGitOperations = 0;

export function beginGitOperation(): (() => void) | null {
	if (runningGitOperations >= MAX_CONCURRENT_GIT_OPERATIONS) {
		return null;
	}
	runningGitOperations++;
	let released = false;
	return () => {
		if (!released) {
			released = true;
			runningGitOperations--;
		}
	};
}
