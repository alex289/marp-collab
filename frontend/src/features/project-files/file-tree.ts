import type { DeckFile } from "../../lib/types.ts";

export type FileTreeNode = {
	name: string;
	path: string;
	file: DeckFile | null;
	children: FileTreeNode[];
};

type MutableFileTreeNode = {
	name: string;
	path: string;
	file: DeckFile | null;
	children: Map<string, MutableFileTreeNode>;
};

export function normalizeProjectFilePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function toFileTreeNodes(nodeMap: Map<string, MutableFileTreeNode>): FileTreeNode[] {
	const nodes = Array.from(nodeMap.values()).map((node) => ({
		name: node.name,
		path: node.path,
		file: node.file,
		children: toFileTreeNodes(node.children),
	}));

	nodes.sort((left, right) => {
		const leftIsFolder =
			left.children.length > 0 || left.file === null || left.file?.type === "folder";
		const rightIsFolder =
			right.children.length > 0 || right.file === null || right.file?.type === "folder";

		if (leftIsFolder !== rightIsFolder) {
			return leftIsFolder ? -1 : 1;
		}

		return left.name.localeCompare(right.name);
	});

	return nodes;
}

export function buildFileTree(files: DeckFile[]): FileTreeNode[] {
	const root = new Map<string, MutableFileTreeNode>();

	for (const file of files) {
		const normalizedId = normalizeProjectFilePath(file.id);
		if (normalizedId.split("/").pop() === ".keep") {
			continue;
		}
		if (!normalizedId) {
			continue;
		}

		const segments = normalizedId.split("/").filter(Boolean);
		if (segments.length === 0) {
			continue;
		}

		let currentLevel = root;
		let currentPath = "";

		for (const [index, segment] of segments.entries()) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;

			let node = currentLevel.get(segment);
			if (!node) {
				node = {
					name: segment,
					path: currentPath,
					file: null,
					children: new Map(),
				};
				currentLevel.set(segment, node);
			}

			if (index === segments.length - 1) {
				node.file = file;
			} else {
				currentLevel = node.children;
			}
		}
	}

	return toFileTreeNodes(root);
}

export function getAncestorFolderPaths(fileId: string): string[] {
	const normalizedId = normalizeProjectFilePath(fileId);
	const segments = normalizedId.split("/").filter(Boolean);
	const ancestors: string[] = [];
	let currentPath = "";

	for (const segment of segments.slice(0, -1)) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		ancestors.push(currentPath);
	}

	return ancestors;
}

export function getParentFolderPath(fileId: string): string {
	const normalized = normalizeProjectFilePath(fileId);
	const lastSlash = normalized.lastIndexOf("/");
	return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
}
