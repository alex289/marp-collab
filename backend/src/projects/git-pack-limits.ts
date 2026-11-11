import { inflateSync } from "node:zlib";

export const MAX_GIT_OBJECT_BYTES = 300 * 1024 * 1024; // 300 MB, as for project imports
export const MAX_GIT_PACK_UNPACKED_BYTES = 1024 * 1024 * 1024; // 1 GB

const OFS_DELTA = 6;
const REF_DELTA = 7;

export class GitPackLimitError extends Error {}

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

	if (chunks.length > 0) {
		return Buffer.concat(chunks);
	}
	const rest = response.subarray(position);
	return text.decode(rest.subarray(0, 4)) === "PACK" ? rest : null;
}

function readSizeVarint(data: Uint8Array, start: number): { value: number; next: number } {
	let value = 0;
	let shift = 0;
	let position = start;
	let byte: number;
	do {
		byte = data[position++] ?? 0;
		value += (byte & 0x7f) * 2 ** shift;
		shift += 7;
	} while (byte & 0x80 && position < data.length);
	return { value, next: position };
}

/**
 * Rejects packs whose objects would expand beyond the limits once isomorphic-git unpacks them in
 * memory. The compressed transfer limit alone does not bound this, since zlib and deltas compress
 * gigabytes into a few kilobytes.
 */
export function assertGitPackWithinLimits(
	response: Uint8Array,
	{ maxObjectBytes = MAX_GIT_OBJECT_BYTES, maxTotalBytes = MAX_GIT_PACK_UNPACKED_BYTES } = {},
): void {
	const pack = packData(response);
	if (!pack || pack.length < 12) {
		return;
	}

	const view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
	const count = view.getUint32(8);
	let position = 12;
	let total = 0;
	for (let index = 0; index < count; index++) {
		let byte = pack[position++] ?? 0;
		const type = (byte >> 4) & 7;
		let size = byte & 0x0f;
		let shift = 4;
		while (byte & 0x80) {
			byte = pack[position++] ?? 0;
			size += (byte & 0x7f) * 2 ** shift;
			shift += 7;
		}
		if (type === OFS_DELTA) {
			while ((pack[position++] ?? 0) & 0x80) {
				// Skip the base offset; only the sizes matter here.
			}
		} else if (type === REF_DELTA) {
			position += 20;
		}
		if (size > maxObjectBytes) {
			throw new GitPackLimitError("Git repository contains a file that exceeds the size limit");
		}

		let inflated: { buffer: Buffer; engine: { bytesWritten: number } };
		try {
			inflated = inflateSync(pack.subarray(position), {
				info: true,
				maxOutputLength: Math.max(size, 1),
			}) as unknown as typeof inflated;
		} catch {
			throw new GitPackLimitError("Git repository contains an invalid or oversized object");
		}
		let unpackedSize = size;
		if (type === OFS_DELTA || type === REF_DELTA) {
			// A delta starts with the size of its base and the size of the object it produces.
			const base = readSizeVarint(inflated.buffer, 0);
			unpackedSize = readSizeVarint(inflated.buffer, base.next).value;
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
