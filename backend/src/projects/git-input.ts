import { z } from "zod";
import { MAX_REPORTED_CONFLICTS } from "./git-conflicts.ts";

/** A pull reports at most this many conflicts, so it never needs more resolutions. */
export const projectGitResolutionsSchema = z
	.record(z.string().max(4096), z.enum(["project", "remote"]))
	.refine((resolutions) => Object.keys(resolutions).length <= MAX_REPORTED_CONFLICTS, {
		message: `Resolve at most ${MAX_REPORTED_CONFLICTS} paths at once`,
	});
