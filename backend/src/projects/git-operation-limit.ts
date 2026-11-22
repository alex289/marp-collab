/** Each Git operation can run a worker with a substantial memory allowance. */
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
