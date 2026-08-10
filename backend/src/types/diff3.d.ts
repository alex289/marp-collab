declare module "diff3" {
	type MergeBlock =
		| { ok: string[]; conflict?: never }
		| { ok?: never; conflict: { a: string[]; o: string[]; b: string[] } };

	export default function diff3Merge(
		ours: string[],
		base: string[],
		theirs: string[],
	): MergeBlock[];
}
