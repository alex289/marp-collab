type RepositoryOperation = "sync" | "maintenance";

type ProjectOperations = {
	repository: RepositoryOperation | null;
	writers: number;
	drain: PromiseWithResolvers<void> | null;
};

const projects = new Map<string, ProjectOperations>();

function operations(projectId: string): ProjectOperations {
	let state = projects.get(projectId);
	if (!state) {
		state = { repository: null, writers: 0, drain: null };
		projects.set(projectId, state);
	}
	return state;
}

function cleanup(projectId: string, state: ProjectOperations): void {
	if (!state.repository && state.writers === 0) {
		projects.delete(projectId);
	}
}

function reserveRepository(projectId: string, operation: RepositoryOperation) {
	const state = operations(projectId);
	if (state.repository) {
		return null;
	}
	state.repository = operation;
	let released = false;
	return {
		state,
		release: () => {
			if (!released) {
				released = true;
				state.repository = null;
				cleanup(projectId, state);
			}
		},
	};
}

/** Reserve the repository for settings changes or deletion without interrupting editors. */
export function beginProjectRepositoryOperation(projectId: string): (() => void) | null {
	return reserveRepository(projectId, "maintenance")?.release ?? null;
}

/** Reserve synchronization immediately, then drain previously admitted mutations. */
export function beginProjectSync(projectId: string) {
	const lease = reserveRepository(projectId, "sync");
	if (!lease) {
		return null;
	}
	const { state, release } = lease;
	const writesDrained =
		state.writers === 0
			? Promise.resolve()
			: (state.drain ??= Promise.withResolvers<void>()).promise;
	return { release, writesDrained };
}

export function isProjectSyncing(projectId: string): boolean {
	return projects.get(projectId)?.repository === "sync";
}

/** Hold admission throughout asynchronous body parsing, document flushes and filesystem writes. */
export function beginProjectWrite(projectId: string): (() => void) | null {
	const state = operations(projectId);
	if (state.repository === "sync") {
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
			state.drain?.resolve();
			state.drain = null;
		}
		cleanup(projectId, state);
	};
}

// Serialize file tree mutations so destination checks and the corresponding writes stay together.
const contentMutations = new Map<string, Promise<void>>();

export async function withProjectContentMutation<Result>(
	projectId: string,
	mutate: () => Promise<Result>,
): Promise<Result> {
	const previous = contentMutations.get(projectId);
	const { promise, resolve } = Promise.withResolvers<void>();
	contentMutations.set(projectId, promise);
	try {
		await previous;
		return await mutate();
	} finally {
		resolve();
		if (contentMutations.get(projectId) === promise) {
			contentMutations.delete(projectId);
		}
	}
}
