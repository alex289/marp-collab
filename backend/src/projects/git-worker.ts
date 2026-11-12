import { writeFile } from "node:fs/promises";
import { handleGitTask, serializeGitError, type GitTask, type GitTaskReply } from "./git-tasks.ts";

/** Entry point of the process git-process.ts starts for each Git task. */
process.once("message", async (task: GitTask) => {
	let reply: GitTaskReply;
	try {
		reply = { ok: true, result: await handleGitTask(task) };
	} catch (error) {
		reply = { ok: false, error: serializeGitError(error) };
	}
	process.send!(reply, () => process.exit());
});

// If memory runs out anyway, let Linux's OOM killer stop this process rather than the server.
await writeFile("/proc/self/oom_score_adj", "1000").catch(() => undefined);
