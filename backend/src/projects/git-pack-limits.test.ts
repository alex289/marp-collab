import { after, before, describe, test } from "node:test";
import { doesNotThrow, throws } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
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

/** Encodes an object header: type in bits 4-6, size as little-endian base-128 after 4 bits. */
function objectHeader(type: number, size: number): number[] {
	const bytes = [(type << 4) | (size & 0x0f)];
	for (let rest = Math.floor(size / 16); rest > 0; rest = Math.floor(rest / 128)) {
		bytes[bytes.length - 1]! |= 0x80;
		bytes.push(rest & 0x7f);
	}
	return bytes;
}

function rawPack(...objects: Buffer[]): Buffer {
	const header = Buffer.from([0x50, 0x41, 0x43, 0x4b, 0, 0, 0, 2, 0, 0, 0, 0]);
	header.writeUInt32BE(objects.length, 8);
	return Buffer.concat([header, ...objects]);
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
		// A push status report on band 1 whose bytes would read as a huge object count.
		const report = Buffer.from("\u0001unpack ok\nok refs/heads/main\n");
		doesNotThrow(() =>
			assertGitPackWithinLimits(Buffer.concat([pktLine(report), Buffer.from("0000")])),
		);
	});

	test("rejects sizes padded past 32 bits, where isomorphic-git's reading wraps around", () => {
		const blob = deflateSync(Buffer.alloc(100));
		// 100 is 4 in the first byte and 6 in the next; zero bytes after that only pad the size.
		const padded = (zeros: number) =>
			rawPack(Buffer.concat([Buffer.from([0xb4, 0x86, ...Array(zeros).fill(0x80), 0x00]), blob]));
		doesNotThrow(() => assertGitPackWithinLimits(padded(1)));
		throws(() => assertGitPackWithinLimits(padded(3)), GitPackLimitError);
	});

	test("rejects delta target sizes padded past 32 bits", () => {
		// Base size 1, then target size 5 followed by zero bytes that only pad it.
		const delta = (zeros: number) => {
			const data = Buffer.from([0x01, 0x85, ...Array(zeros).fill(0x80), 0x00]);
			return rawPack(
				Buffer.concat([
					Buffer.from(objectHeader(7, data.length)),
					Buffer.alloc(20),
					deflateSync(data),
				]),
			);
		};
		doesNotThrow(() => assertGitPackWithinLimits(delta(1)));
		throws(() => assertGitPackWithinLimits(delta(4)), GitPackLimitError);
	});

	test("rejects packs with too many objects or truncated objects", () => {
		const empty = Buffer.concat([Buffer.from(objectHeader(3, 0)), deflateSync(Buffer.alloc(0))]);
		throws(
			() => assertGitPackWithinLimits(rawPack(empty, empty, empty), { maxObjects: 2 }),
			/too many objects/,
		);
		const truncated = rawPack(empty);
		truncated.writeUInt32BE(5, 8);
		throws(() => assertGitPackWithinLimits(truncated), GitPackLimitError);
	});
});
