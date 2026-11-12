import { fork } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { logger } from "../helpers/logger.ts";
import {
	deserializeGitError,
	handleGitTask,
	serializeGitError,
	type GitTask,
	type GitTaskReply,
	type GitTaskResult,
} from "./git-tasks.ts";

/**
 * A remote can send objects that make isomorphic-git exhaust memory or CPU while unpacking them,
 * so each task runs in its own process that is stopped once it exceeds these limits.
 */
export const GIT_TASK_LIMITS = {
	timeoutMs: 3 * 60_000,
	heapMb: 512,
	// Buffers live outside the JavaScript heap, so also watch the process's resident memory.
	residentBytes: 1536 * 1024 * 1024,
};

const WORKER = join(import.meta.dirname, `git-worker${extname(import.meta.filename)}`);
const MEMORY_CHECK_INTERVAL_MS = 250;
const TLS_ENVIRONMENT = [
	"NODE_EXTRA_CA_CERTS",
	"NODE_USE_SYSTEM_CA",
	"SSL_CERT_DIR",
	"SSL_CERT_FILE",
];

/** The task's process crashed or was stopped, so it may have left its work half done. */
export class ProjectGitProcessError extends Error {
	/** Stopped at a limit, which the repository's contents caused rather than a fault. */
	readonly exceededLimit: boolean;

	constructor(message: string, exceededLimit: boolean) {
		super(message);
		this.exceededLimit = exceededLimit;
	}
}

/** How much of the process's error output to keep for the log. */
const STDERR_TAIL_BYTES = 4096;

function processError(reason: string | undefined, signal: NodeJS.Signals | null) {
	if (reason === "timeout") {
		return new ProjectGitProcessError("Git sync stopped because it took too long", true);
	}
	// V8 aborts when the heap limit is reached; the kernel's OOM killer sends SIGKILL.
	if (reason === "memory" || signal === "SIGABRT" || signal === "SIGKILL") {
		return new ProjectGitProcessError(
			"Git sync stopped because the repository needed too much memory",
			true,
		);
	}
	return new ProjectGitProcessError("Git sync failed unexpectedly", false);
}

type GitTaskOptions = Partial<typeof GIT_TASK_LIMITS> & { worker?: string };

let inProcess = false;

/** Lets tests run tasks in the test's process, so they can stub isomorphic-git's network calls. */
export function runGitTasksInProcess(): void {
	inProcess = true;
}

/** Resident memory from Linux's /proc, or null where that is unavailable. */
async function residentBytes(pid: number): Promise<number | null> {
	try {
		const status = await readFile(`/proc/${pid}/status`, "utf8");
		const match = /^VmRSS:\s+(\d+) kB$/m.exec(status);
		return match ? Number(match[1]) * 1024 : null;
	} catch {
		return null;
	}
}

function runInChildProcess(
	task: GitTask,
	{ worker = WORKER, ...options }: GitTaskOptions,
): Promise<unknown> {
	const limits = { ...GIT_TASK_LIMITS, ...options };
	return new Promise((resolve, reject) => {
		// Pass only what TLS needs, keeping the server's secrets out of the process.
		const child = fork(worker, [], {
			env: Object.fromEntries(
				TLS_ENVIRONMENT.flatMap((name) =>
					process.env[name] === undefined ? [] : [[name, process.env[name]]],
				),
			),
			execArgv: [`--max-old-space-size=${limits.heapMb}`],
			// Output can quote the remote's paths at any length, so keep only a short tail for the log.
			stdio: ["ignore", "ignore", "pipe", "ipc"],
		});
		let stderr = Buffer.alloc(0);
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr = Buffer.concat([stderr, chunk]).subarray(-STDERR_TAIL_BYTES);
		});
		let settled = false;
		let stopReason: string | undefined;
		const settle = (finish: () => void) => {
			if (!settled) {
				settled = true;
				clearTimeout(timeout);
				clearInterval(memoryCheck);
				finish();
			}
		};
		const stop = (reason: string) => {
			stopReason ??= reason;
			child.kill("SIGKILL");
		};
		const timeout = setTimeout(() => stop("timeout"), limits.timeoutMs);
		const memoryCheck = setInterval(async () => {
			const resident = child.pid ? await residentBytes(child.pid) : null;
			if (resident === null) {
				clearInterval(memoryCheck);
			} else if (resident > limits.residentBytes) {
				stop("memory");
			}
		}, MEMORY_CHECK_INTERVAL_MS);

		child.on("message", (reply: GitTaskReply) => {
			settle(() => (reply.ok ? resolve(reply.result) : reject(deserializeGitError(reply.error))));
			child.kill("SIGKILL");
		});
		child.on("error", (error) => {
			settle(() => reject(error));
			child.kill("SIGKILL");
		});
		child.on("exit", (code, signal) => {
			settle(() => {
				logger.warn(
					{ task: task.type, code, signal, reason: stopReason, stderr: stderr.toString() },
					"Git task process stopped",
				);
				reject(processError(stopReason, signal));
			});
		});
		child.send(task);
	});
}

async function runHere(task: GitTask): Promise<unknown> {
	try {
		return structuredClone(await handleGitTask(task));
	} catch (error) {
		throw deserializeGitError(serializeGitError(error));
	}
}

export async function runGitTask<T extends GitTask>(
	task: T,
	options: GitTaskOptions = {},
): Promise<GitTaskResult<T>> {
	return (await (inProcess ? runHere(task) : runInChildProcess(task, options))) as GitTaskResult<T>;
}
