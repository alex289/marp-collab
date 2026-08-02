import { cssLanguage } from "@codemirror/lang-css";
import { markdownLanguage } from "@codemirror/lang-markdown";

export type MissingAssetReference = {
	from: number;
	to: number;
	reference: string;
	resolvedPath: string;
};

type AssetReference = {
	from: number;
	to: number;
	reference: string;
};

type DocumentKind = "css" | "markdown";

const markdownEscapeRegex = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const externalReferenceRegex = /^[a-z][a-z\d+.-]*:/i;

function normalizeLinkLabel(label: string): string {
	return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function referenceFromRange(
	content: string,
	from: number,
	to: number,
	stripAngleBrackets = false,
): AssetReference | null {
	let referenceFrom = from;
	let referenceTo = to;
	let reference = content.slice(referenceFrom, referenceTo).trim();

	const leadingWhitespace = content.slice(referenceFrom, referenceTo).indexOf(reference);
	if (leadingWhitespace > 0) {
		referenceFrom += leadingWhitespace;
	}
	referenceTo = referenceFrom + reference.length;

	if (stripAngleBrackets && reference.startsWith("<") && reference.endsWith(">")) {
		reference = reference.slice(1, -1);
		referenceFrom += 1;
		referenceTo -= 1;
	}

	return reference ? { from: referenceFrom, to: referenceTo, reference } : null;
}

function collectHtmlImageReferences(content: string, from: number, to: number): AssetReference[] {
	const references: AssetReference[] = [];
	const html = content.slice(from, to);
	const imageSourceRegex = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

	for (const match of html.matchAll(imageSourceRegex)) {
		const reference = match[1] ?? match[2] ?? match[3] ?? "";
		if (!reference || match.index === undefined) {
			continue;
		}

		// The src value is the final capture in the matched prefix, so lastIndexOf
		// also handles an identical value appearing in an earlier attribute.
		const relativeFrom = match.index + match[0].lastIndexOf(reference);
		references.push({
			from: from + relativeFrom,
			to: from + relativeFrom + reference.length,
			reference,
		});
	}

	return references;
}

function collectMarkdownReferences(content: string): AssetReference[] {
	const references: AssetReference[] = [];
	const referencedLabels = new Set<string>();
	const definitions = new Map<string, AssetReference>();
	const tree = markdownLanguage.parser.parse(content);

	tree.iterate({
		enter(node) {
			if (node.name === "Image") {
				let directReference: AssetReference | null = null;
				let explicitLabel: string | null = null;
				let altTextEnd: number | null = null;

				node.node.cursor().iterate((child) => {
					if (child.name === "URL") {
						directReference = referenceFromRange(content, child.from, child.to, true);
					} else if (child.name === "LinkLabel") {
						explicitLabel = content.slice(child.from + 1, child.to - 1);
					} else if (
						child.name === "LinkMark" &&
						altTextEnd === null &&
						content.slice(child.from, child.to) === "]"
					) {
						altTextEnd = child.from;
					}
				});

				if (directReference) {
					references.push(directReference);
				} else if (altTextEnd !== null) {
					const fallbackLabel = content.slice(node.from + 2, altTextEnd);
					const label = normalizeLinkLabel(explicitLabel || fallbackLabel);
					if (label) {
						referencedLabels.add(label);
					}
				}

				return false;
			}

			if (node.name === "LinkReference") {
				let label = "";
				let reference: AssetReference | null = null;
				node.node.cursor().iterate((child) => {
					if (child.name === "LinkLabel") {
						label = normalizeLinkLabel(content.slice(child.from + 1, child.to - 1));
					} else if (child.name === "URL") {
						reference = referenceFromRange(content, child.from, child.to, true);
					}
				});

				if (label && reference && !definitions.has(label)) {
					definitions.set(label, reference);
				}
				return false;
			}

			if (node.name === "HTMLBlock" || node.name === "HTMLTag") {
				references.push(...collectHtmlImageReferences(content, node.from, node.to));
				return false;
			}
		},
	});

	for (const label of referencedLabels) {
		const definition = definitions.get(label);
		if (definition) {
			references.push(definition);
		}
	}

	return references.sort((a, b) => a.from - b.from);
}

function collectCssReferences(content: string): AssetReference[] {
	const references: AssetReference[] = [];
	const tree = cssLanguage.parser.parse(content);

	tree.iterate({
		enter(node) {
			if (node.name !== "CallLiteral") {
				return;
			}

			const call = content.slice(node.from, node.to);
			const openParen = call.indexOf("(");
			const closeParen = call.lastIndexOf(")");
			if (
				openParen === -1 ||
				closeParen <= openParen ||
				call.slice(0, openParen).trim().toLowerCase() !== "url"
			) {
				return false;
			}

			let innerFrom = openParen + 1;
			let innerTo = closeParen;
			while (/\s/.test(call[innerFrom] ?? "")) {
				innerFrom += 1;
			}
			while (innerTo > innerFrom && /\s/.test(call[innerTo - 1] ?? "")) {
				innerTo -= 1;
			}

			const quote = call[innerFrom];
			if ((quote === '"' || quote === "'") && call[innerTo - 1] === quote) {
				innerFrom += 1;
				innerTo -= 1;
			}

			const reference = referenceFromRange(content, node.from + innerFrom, node.from + innerTo);
			if (reference) {
				references.push(reference);
			}
			return false;
		},
	});

	return references;
}

function normalizeReference(reference: string, kind: DocumentKind): string | null {
	let normalized = reference.trim();
	if (
		!normalized ||
		normalized.startsWith("//") ||
		normalized.startsWith("#") ||
		externalReferenceRegex.test(normalized) ||
		/^var\s*\(/i.test(normalized)
	) {
		return null;
	}

	const suffixIndex = normalized.search(/[?#]/);
	if (suffixIndex !== -1) {
		normalized = normalized.slice(0, suffixIndex);
	}

	normalized =
		kind === "markdown"
			? normalized.replace(markdownEscapeRegex, "$1")
			: normalized.replace(/\\([^\r\n\f])/g, "$1");

	try {
		normalized = decodeURIComponent(normalized);
	} catch {
		// Keep malformed percent escapes literal, matching how the browser requests them.
	}

	return normalized || null;
}

function resolveProjectPath(documentId: string, reference: string): string {
	const documentParts = documentId.split("/");
	documentParts.pop();
	const parts = reference.startsWith("/")
		? reference.slice(1).split("/")
		: [...documentParts, ...reference.split("/")];
	const resolved: string[] = [];

	for (const part of parts) {
		if (!part || part === ".") {
			continue;
		}
		if (part === "..") {
			resolved.pop();
			continue;
		}
		resolved.push(part);
	}

	return resolved.join("/");
}

export function findMissingAssetReferences(
	content: string,
	documentId: string,
	kind: DocumentKind,
	projectFileIds: ReadonlySet<string>,
): MissingAssetReference[] {
	const references =
		kind === "css" ? collectCssReferences(content) : collectMarkdownReferences(content);
	const missing: MissingAssetReference[] = [];

	for (const reference of references) {
		const normalized = normalizeReference(reference.reference, kind);
		if (!normalized) {
			continue;
		}

		const resolvedPath = resolveProjectPath(documentId, normalized);
		if (resolvedPath && !projectFileIds.has(resolvedPath)) {
			missing.push({ ...reference, resolvedPath });
		}
	}

	return missing;
}
