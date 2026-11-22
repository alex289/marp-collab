export const DOCUMENT_STATE_SUFFIX = ".yjs";

export function documentStatePath(filePath: string): string {
	return `${filePath}${DOCUMENT_STATE_SUFFIX}`;
}
