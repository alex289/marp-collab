import { after, before, describe, test } from "node:test";
import { doesNotThrow, throws } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertGitPackWithinLimits, GitPackLimitError } from "./git-pack-limits.ts";

function pktLine(payload: Uint8Array): Buffer {
	return Buffer.concat([
		Buffer.from((payload.length + 4).toString(16).padStart(4, "0")),
		Buffer.from(payload),
	]);
}

/** Frames a pack the way git-upload-pack sends it with side-band-64k. */
function sideBandResponse(pack: Buffer): Buffer {
	const lines = [pktLine(Buffer.from("NAK\n"))];
	for (let offset = 0; offset < pack.length; offset += 65_000) {
		lines.push(
			pktLine(Buffer.concat([Buffer.from([1]), pack.subarray(offset, offset + 65_000)])),
			pktLine(Buffer.from("\u0002Counting objects\n")),
		);
	}
	lines.push(Buffer.from("0000"));
	return Buffer.concat(lines);
}

describe("Git pack limits", () => {
	let repository: string;
	let pack: Buffer;

	before(async () => {
		repository = await mkdtemp(join(tmpdir(), "marp-test-git-pack-"));
		const run = (...args: string[]) =>
			execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
		run("init", "-b", "main");
		// Two large, similar files compress to a few kilobytes and produce a delta.
		const content = "slide\n".repeat(400_000);
		await writeFile(join(repository, "a.md"), content);
		run("add", ".");
		run("-c", "user.name=T", "-c", "user.email=t@e", "commit", "-m", "one");
		await writeFile(join(repository, "a.md"), `${content}changed\n`);
		run("add", ".");
		run("-c", "user.name=T", "-c", "user.email=t@e", "commit", "-m", "two");
		const objects = run("rev-list", "--objects", "--all")
			.split("\n")
			.map((line) => line.split(" ")[0])
			.join("\n");
		pack = execFileSync("git", ["-C", repository, "pack-objects", "--stdout"], {
			input: `${objects}\n`,
		});
	});

	after(async () => {
		await rm(repository, { recursive: true, force: true });
	});

	test("accepts packs within the limits", () => {
		doesNotThrow(() => assertGitPackWithinLimits(sideBandResponse(pack)));
		doesNotThrow(() => assertGitPackWithinLimits(pack));
	});

	test("rejects objects that unpack beyond the object limit", () => {
		throws(
			() => assertGitPackWithinLimits(sideBandResponse(pack), { maxObjectBytes: 1024 * 1024 }),
			GitPackLimitError,
		);
	});

	test("counts delta results toward the total limit", () => {
		// Each version of a.md is 2.4 MB, so both together exceed 4 MB only when deltas are expanded.
		throws(
			() => assertGitPackWithinLimits(sideBandResponse(pack), { maxTotalBytes: 4 * 1024 * 1024 }),
			GitPackLimitError,
		);
		doesNotThrow(() =>
			assertGitPackWithinLimits(sideBandResponse(pack), { maxTotalBytes: 6 * 1024 * 1024 }),
		);
	});

	test("ignores responses without pack data", () => {
		doesNotThrow(() => assertGitPackWithinLimits(Buffer.from("0008NAK\n0000")));
	});
});
