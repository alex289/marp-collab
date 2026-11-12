import { inflateSync } from "node:zlib";

export const MAX_GIT_OBJECT_BYTES = 300 * 1024 * 1024; // 300 MB, as for project imports
export const MAX_GIT_PACK_UNPACKED_BYTES = 1024 * 1024 * 1024; // 1 GB
export const MAX_GIT_PACK_OBJECTS = 500_000;

const OFS_DELTA = 6;
const REF_DELTA = 7;

type Inflated = { buffer: Buffer; engine: { bytesWritten: number } };

export class GitPackLimitError extends Error {}

function invalidPack(): GitPackLimitError {
	return new GitPackLimitError("Git repository contains an invalid or oversized object");
}

/** Extracts the packfile carried by a git-upload-pack response, with or without side-band framing. */
function packData(response: Uint8Array): Uint8Array | null {
	const chunks: Uint8Array[] = [];
	const text = new TextDecoder();
	let position = 0;
	while (position + 4 <= response.length) {
		const length = Number.parseInt(text.decode(response.subarray(position, position + 4)), 16);
		if (Number.isNaN(length)) {
			break;
		}
		if (length < 4) {
			position += 4;
			continue;
		}
		const payload = response.subarray(position + 4, position + length);
		// Band 1 carries pack data; bands 2 and 3 carry progress and errors, other lines are ACK/NAK.
		if (payload[0] === 1) {
			chunks.push(payload.subarray(1));
		}
		position += length;
	}

	// Push status reports also travel on band 1, so only data with a pack signature is a pack.
	const data = chunks.length > 0 ? Buffer.concat(chunks) : response.subarray(position);
	return text.decode(data.subarray(0, 4)) === "PACK" ? data : null;
}

/**
 * Reads a little-endian base-128 size continuing from `value` at bit `shift`. isomorphic-git reads
 * these with 32-bit integer operations, so encodings where that disagrees with the real value
 * (padding, more than 31 bits) are rejected rather than trusted.
 */
function readSize(
	data: Uint8Array,
	start: number,
	value: number,
	shift: number,
): { value: number; next: number } {
	let exact = value;
	let wrapped = value;
	let position = start;
	let byte: number;
	do {
		if (position >= data.length || shift > 28) {
			throw invalidPack();
		}
		byte = data[position++]!;
		exact += (byte & 0x7f) * 2 ** shift;
		wrapped |= (byte & 0x7f) << shift;
		shift += 7;
	} while (byte & 0x80);
	if (exact !== wrapped) {
		throw invalidPack();
	}
	return { value: exact, next: position };
}

function inflateObject(data: Uint8Array, size: number): Inflated {
	// isomorphic-git rejects objects whose inflated size differs from the header, so cap at it.
	return inflateSync(data, {
		info: true,
		maxOutputLength: Math.max(size, 1),
	}) as unknown as Inflated;
}

/**
 * Rejects packs whose objects would expand beyond the limits once isomorphic-git unpacks them in
 * memory. The compressed transfer limit alone does not bound this, since zlib and deltas compress
 * gigabytes into a few kilobytes. This is a first filter for ordinary oversized repositories:
 * crafted packs can still make unpacking expensive, which the Git task process limits contain.
 */
export function assertGitPackWithinLimits(
	response: Uint8Array,
	{
		maxObjectBytes = MAX_GIT_OBJECT_BYTES,
		maxTotalBytes = MAX_GIT_PACK_UNPACKED_BYTES,
		maxObjects = MAX_GIT_PACK_OBJECTS,
	} = {},
): void {
	const pack = packData(response);
	if (!pack || pack.length < 12) {
		return;
	}

	const view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
	const count = view.getUint32(8);
	if (count > maxObjects) {
		throw new GitPackLimitError("Git repository contains too many objects");
	}
	let position = 12;
	let total = 0;
	for (let index = 0; index < count; index++) {
		const first = pack[position++];
		if (first === undefined) {
			throw invalidPack();
		}
		const type = (first >> 4) & 7;
		let size = first & 0x0f;
		if (first & 0x80) {
			({ value: size, next: position } = readSize(pack, position, size, 4));
		}
		if (type === OFS_DELTA) {
			({ next: position } = readSize(pack, position, 0, 0));
		} else if (type === REF_DELTA) {
			position += 20;
		}
		if (size > maxObjectBytes) {
			throw new GitPackLimitError("Git repository contains a file that exceeds the size limit");
		}

		let inflated: Inflated;
		try {
			inflated = inflateObject(pack.subarray(position), size);
		} catch {
			throw invalidPack();
		}
		let unpackedSize = size;
		if (type === OFS_DELTA || type === REF_DELTA) {
			// A delta starts with the size of its base and the size of the object it produces.
			const base = readSize(inflated.buffer, 0, 0, 0);
			unpackedSize = readSize(inflated.buffer, base.next, 0, 0).value;
		}
		if (unpackedSize > maxObjectBytes) {
			throw new GitPackLimitError("Git repository contains a file that exceeds the size limit");
		}
		total += unpackedSize;
		if (total > maxTotalBytes) {
			throw new GitPackLimitError("Git repository exceeds the size limit");
		}
		position += inflated.engine.bytesWritten;
	}
}
