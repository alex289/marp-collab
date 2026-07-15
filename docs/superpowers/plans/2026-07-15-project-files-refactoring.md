# Project-files Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Project-files-Workflow hinter ein tiefes Module verschieben, ohne sichtbares Verhalten, Backend-Endpunkte oder Payloads zu ändern.

**Architecture:** Pure TypeScript-Module besitzen File-tree-, Reconciliation-, Presence- und Workspace-State-Regeln. Ein injizierbarer HTTP-Adapter und ein React-Workspace-Module koordinieren die bestehenden Mutationen; `FileSidebar` und die Dialoge werden zu Callern eines schmaleren Interface. Die rekursive File-tree-Ansicht verwendet einen internen Context statt 18 rekursiv weitergereichter Properties.

**Tech Stack:** TypeScript 6, Node 24+ Test Runner, React 19, Yjs Awareness, pnpm 11, Playwright.

## Global Constraints

- Keine sichtbare oder funktionale Änderung.
- Keine Änderung an Backend-Endpunkten oder Payloads.
- Kein optimistisches Update und kein globaler Store.
- Keine neue Runtime- oder Test-Abhängigkeit.
- Direkt durch Node getestete Feature-Module verwenden relative `.ts`-Imports; Node muss keine Vite-Pfadaliasse auflösen.
- `frontend/src/components/ui/sidebar.tsx` bleibt unverändert.
- Alle Änderungen bleiben ungestaged und uncommitted, bis der Benutzer sie ausdrücklich freigibt.
- Keine `git add`-, `git commit`-, Push- oder PR-Schritte während der Plan-Ausführung.
- Bestehende Fehlermeldungen und Reload-Semantik bleiben erhalten.
- Ein fehlendes Test-Target ist nur ein Setup-Fehler: Danach werden minimale Exports ergänzt, die `Not implemented` werfen, und RED wird erst akzeptiert, wenn der Test wegen dieser fachlich fehlenden Implementation fehlschlägt.

---

## Geplante Dateistruktur

```text
frontend/src/features/project-files/
├── file-tree.ts                         # Pfadnormalisierung und Baumableitung
├── file-tree.test.ts                    # Charakterisierung des File tree
├── file-reconciliation.ts               # Selection- und Open-folder-Übergänge
├── file-reconciliation.test.ts          # Reconciliation-Charakterisierung
├── project-file-presence.ts             # Pure Awareness-Ableitung
├── project-file-presence.test.ts        # Presence-Charakterisierung
├── project-files-client.ts              # Bestehende HTTP-Endpunkte als Adapter
├── project-files-client.test.ts         # Request-/Response-Verträge
├── project-files-workspace-state.ts     # Pure Drag-/Folder-State-Übergänge
├── project-files-workspace-state.test.ts
├── use-project-file-presence.ts         # Awareness-Subscription
├── use-project-files-workspace.ts       # React-Koordination und Befehle
├── file-tree-view.tsx                   # Rekursive Ansicht mit internem Context
├── project-files-panel.tsx              # Toolbar, Status und Dialog-Host
└── image-preview-dialog.tsx             # Asset-Vorschau
```

Geänderte bestehende Dateien:

```text
frontend/package.json
frontend/src/routes/presentations/$id.tsx
frontend/src/components/file-sidebar.tsx
frontend/src/components/dialog/create-file.tsx
frontend/src/components/dialog/create-folder.tsx
frontend/src/components/dialog/upload-file.tsx
frontend/src/components/dialog/delete-file.tsx
frontend/src/components/dialog/rename-file.tsx
```

Entfernte bestehende Dateien nach abgeschlossener Migration:

```text
frontend/src/hooks/use-files.ts
frontend/src/lib/upload-files.ts
```

---

### Task 1: File-tree-Testoberfläche und Pfadregeln

**Files:**

- Create: `frontend/src/features/project-files/file-tree.test.ts`
- Create: `frontend/src/features/project-files/file-tree.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/src/components/file-sidebar.tsx:64-170`

**Interfaces:**

- Consumes: `DeckFile` aus `frontend/src/lib/types.ts`
- Produces:

```ts
export type FileTreeNode = {
	name: string;
	path: string;
	file: DeckFile | null;
	children: FileTreeNode[];
};

export function normalizeProjectFilePath(path: string): string;
export function buildFileTree(files: DeckFile[]): FileTreeNode[];
export function getAncestorFolderPaths(fileId: string): string[];
export function getParentFolderPath(fileId: string): string;
```

- [ ] **Step 1: Frontend-Testbefehl und failing File-tree-Tests schreiben**

Ergänze in `frontend/package.json`:

```json
"test": "node --test src/features/project-files/*.test.ts"
```

Erstelle `file-tree.test.ts` mit einzelnen Tests für Normalisierung, `.keep`, implizite Ordner, explizite Ordner, Sortierung, Ancestors und Parent:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { DeckFile } from "../../lib/types.ts";
import {
	buildFileTree,
	getAncestorFolderPaths,
	getParentFolderPath,
	normalizeProjectFilePath,
} from "./file-tree.ts";

const file = (id: string, type: DeckFile["type"] = "markdown"): DeckFile => ({
	id,
	label: id,
	type,
	...(type === "markdown" ? { documentName: `project/test/${id}` } : {}),
});

test("normalizes separators and surrounding slashes", () => {
	assert.equal(normalizeProjectFilePath("/slides\\intro.md/"), "slides/intro.md");
});

test("builds implicit folders and hides .keep", () => {
	assert.deepEqual(buildFileTree([file("notes/.keep", "asset"), file("notes/intro.md")]), [
		{
			name: "notes",
			path: "notes",
			file: null,
			children: [
				{
					name: "intro.md",
					path: "notes/intro.md",
					file: file("notes/intro.md"),
					children: [],
				},
			],
		},
	]);
});

test("sorts folders before files and names alphabetically", () => {
	assert.deepEqual(
		buildFileTree([file("z.md"), file("b/item.md"), file("a/item.md"), file("a.md")]).map(
			(node) => node.name,
		),
		["a", "b", "a.md", "z.md"],
	);
});

test("preserves explicit folder records", () => {
	const folder = file("assets", "folder");
	assert.equal(buildFileTree([folder, file("assets/logo.png", "asset")])[0]?.file, folder);
});

test("returns ancestor and parent paths", () => {
	assert.deepEqual(getAncestorFolderPaths("a/b/slides.md"), ["a", "a/b"]);
	assert.equal(getParentFolderPath("a/b/slides.md"), "a/b");
	assert.equal(getParentFolderPath("slides.md"), "");
});
```

- [ ] **Step 2: RED verifizieren**

Run:

```bash
pnpm --filter vite-app test
```

Expected: FAIL, weil `file-tree.ts` noch nicht existiert.

- [ ] **Step 3: File-tree-Implementation extrahieren**

Verschiebe die vorhandenen Typen und Funktionen aus `file-sidebar.tsx` nach `file-tree.ts`. Benenne nur die vier exportierten Funktionen gemäß dem Interface um. Die Implementation bleibt ansonsten byte-nah am bestehenden Verhalten.

- [ ] **Step 4: Sidebar auf das neue Module umstellen**

Ersetze private Baum-/Pfadfunktionen durch:

```ts
import {
	buildFileTree,
	getAncestorFolderPaths,
	getParentFolderPath,
	type FileTreeNode,
} from "@/features/project-files/file-tree";
```

Passe `NestedFileNode` auf `FileTreeNode`, `buildNestedFileTree` auf `buildFileTree` und `getParentFolder` auf `getParentFolderPath` an.

- [ ] **Step 5: GREEN und Zwischenstand verifizieren**

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
```

Expected: alle File-tree-Tests PASS; Typecheck exit 0.

Checkpoint: `git diff -- frontend/package.json frontend/src/features/project-files frontend/src/components/file-sidebar.tsx` prüfen. Nicht stagen oder committen.

---

### Task 2: Selection- und Open-folder-Reconciliation

**Files:**

- Create: `frontend/src/features/project-files/file-reconciliation.test.ts`
- Create: `frontend/src/features/project-files/file-reconciliation.ts`
- Modify: `frontend/src/components/file-sidebar.tsx:878-1024`

**Interfaces:**

```ts
export type RenameResult =
	| { type: "file"; oldFileId: string; newFileId: string }
	| { type: "folder"; oldFolderPath: string; newFolderPath: string };

export function reconcileSelectedFileAfterMove(
	projectId: string,
	selectedFile: DeckFile | null,
	oldFileId: string,
	newFileId: string,
): DeckFile | null;

export function reconcileSelectedFileAfterRename(
	projectId: string,
	selectedFile: DeckFile | null,
	result: RenameResult,
): DeckFile | null;

export function reconcileOpenFoldersAfterRename(
	openFolders: Record<string, boolean>,
	result: RenameResult,
): Record<string, boolean>;

export function expandOpenFoldersForSelection(
	openFolders: Record<string, boolean>,
	selectedFileId: string | null,
): Record<string, boolean>;
```

- [ ] **Step 1: Failing Reconciliation-Tests schreiben**

Tests müssen mindestens diese konkreten Fälle enthalten:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { DeckFile } from "../../lib/types.ts";
import {
	expandOpenFoldersForSelection,
	reconcileOpenFoldersAfterRename,
	reconcileSelectedFileAfterMove,
	reconcileSelectedFileAfterRename,
} from "./file-reconciliation.ts";

const markdown = (id: string): DeckFile => ({
	id,
	label: id,
	type: "markdown",
	documentName: `project/test/${id}`,
});

test("updates a selected markdown file after move", () => {
	const selected = markdown("old/slides.md");
	assert.deepEqual(
		reconcileSelectedFileAfterMove("project-1", selected, "old/slides.md", "new/slides.md"),
		{
			...selected,
			id: "new/slides.md",
			label: "new/slides.md",
			documentName: "project/project-1/new/slides.md",
		},
	);
});

test("rebases a selected child after folder rename", () => {
	const selected = markdown("old/nested/slides.md");
	assert.equal(
		reconcileSelectedFileAfterRename("project-1", selected, {
			type: "folder",
			oldFolderPath: "old",
			newFolderPath: "new",
		})?.id,
		"new/nested/slides.md",
	);
});

test("leaves an unrelated selection unchanged by identity", () => {
	const selected = markdown("other.md");
	assert.equal(
		reconcileSelectedFileAfterRename("project-1", selected, {
			type: "file",
			oldFileId: "slides.md",
			newFileId: "deck.md",
		}),
		selected,
	);
});

test("rebases open descendants after folder rename", () => {
	assert.deepEqual(
		reconcileOpenFoldersAfterRename(
			{ old: true, "old/nested": true, other: false },
			{ type: "folder", oldFolderPath: "old", newFolderPath: "new" },
		),
		{ new: true, "new/nested": true, other: false },
	);
});

test("opens every ancestor of the selected file", () => {
	assert.deepEqual(expandOpenFoldersForSelection({ closed: false }, "a/b/slides.md"), {
		closed: false,
		a: true,
		"a/b": true,
	});
});
```

- [ ] **Step 2: RED verifizieren**

Run: `pnpm --filter vite-app test`

Expected: FAIL wegen fehlendem `file-reconciliation.ts`.

- [ ] **Step 3: Pure Reconciliation implementieren**

Nutze eine interne Funktion, die ausschließlich betroffene IDs rebased:

```ts
function withFileId(projectId: string, file: DeckFile, fileId: string): DeckFile {
	return {
		...file,
		id: fileId,
		label: fileId,
		documentName: file.type === "markdown" ? `project/${projectId}/${fileId}` : file.documentName,
	};
}
```

Unveränderte Ergebnisse müssen dieselbe Objektidentität behalten.

- [ ] **Step 4: Sidebar-Reconciliation durch pure Funktionen ersetzen**

`handleRenameComplete`, der Move-Erfolg und der Selection-Effect rufen nur noch die exportierten Funktionen auf. Entferne die duplizierten Pfadschleifen aus `file-sidebar.tsx`.

- [ ] **Step 5: GREEN verifizieren**

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
```

Expected: alle Tests PASS; Typecheck exit 0.

Checkpoint: Diff prüfen; nicht stagen oder committen.

---

### Task 3: Project-file Presence vertiefen

**Files:**

- Create: `frontend/src/features/project-files/project-file-presence.test.ts`
- Create: `frontend/src/features/project-files/project-file-presence.ts`
- Create: `frontend/src/features/project-files/use-project-file-presence.ts`
- Modify: `frontend/src/components/file-sidebar.tsx:335-420, 842-876`

**Interfaces:**

```ts
export type ProjectFilePresenceParticipant = {
	id: string;
	name: string;
	color: string;
	image: string | null;
};

export type ProjectFilePresenceById = Record<string, ProjectFilePresenceParticipant[]>;

export function getProjectFilePresenceById(
	states: Iterable<unknown>,
	currentUserId: string | null,
): ProjectFilePresenceById;

export function useProjectFilePresence(
	awareness: Awareness | null,
	currentUserId: string | null,
): ProjectFilePresenceById;
```

- [ ] **Step 1: Failing Presence-Tests schreiben**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getProjectFilePresenceById } from "./project-file-presence.ts";

test("groups, deduplicates and sorts valid participants by file", () => {
	const states = [
		{ user: { id: "2", name: "Zoë", color: "#222", image: null }, activeFile: { fileId: "a.md" } },
		{
			user: { id: "1", name: "Ada", color: "#111", image: "ada.png" },
			activeFile: { fileId: "a.md" },
		},
		{ user: { id: "1", name: "Ada", color: "#111" }, activeFile: { fileId: "a.md" } },
	];

	assert.deepEqual(
		getProjectFilePresenceById(states, null).a?.map(({ id }) => id),
		["1", "2"],
	);
});

test("excludes the current user and malformed states", () => {
	const states = [
		{ user: { id: "self", name: "Self" }, activeFile: { fileId: "a.md" } },
		{ user: {}, activeFile: { fileId: "a.md" } },
		{ user: { id: "other", name: "Other" }, activeFile: {} },
	];
	assert.deepEqual(getProjectFilePresenceById(states, "self"), {});
});
```

- [ ] **Step 2: RED verifizieren**

Run: `pnpm --filter vite-app test`

Expected: FAIL wegen fehlendem Presence-Module.

- [ ] **Step 3: Pure Ableitung und Hook implementieren**

Verschiebe `parsePresenceParticipant`, `parseActiveFileId` und `getFilePresenceById` in das pure Module. Der Hook kapselt ausschließlich State und Awareness-Subscription:

```ts
export function useProjectFilePresence(awareness: Awareness | null, currentUserId: string | null) {
	const [presence, setPresence] = useState<ProjectFilePresenceById>({});

	useEffect(() => {
		if (!awareness) {
			setPresence({});
			return;
		}
		const update = () =>
			setPresence(getProjectFilePresenceById(awareness.getStates().values(), currentUserId));
		update();
		awareness.on("change", update);
		return () => awareness.off("change", update);
	}, [awareness, currentUserId]);

	return presence;
}
```

- [ ] **Step 4: Sidebar auf den Hook umstellen und GREEN verifizieren**

Entferne die rohe Parsing-Implementation und ihren Effect aus `file-sidebar.tsx`.

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
```

Expected: alle Tests PASS; Typecheck exit 0.

Checkpoint: Diff prüfen; nicht stagen oder committen.

---

### Task 4: Bestehende Project-file-Endpunkte hinter einen HTTP-Adapter ziehen

**Files:**

- Create: `frontend/src/features/project-files/project-files-client.test.ts`
- Create: `frontend/src/features/project-files/project-files-client.ts`
- Read/replace later: `frontend/src/hooks/use-files.ts`
- Read/replace later: `frontend/src/lib/upload-files.ts`

**Interfaces:**

```ts
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ProjectFilesRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProjectFilesRequestError";
	}
}

export type UploadProjectFilesResult = {
	uploadedAny: boolean;
	failures: string[];
};

export interface ProjectFilesClient {
	list(projectId: string): Promise<DeckFile[]>;
	createFile(projectId: string, name: string): Promise<void>;
	createFolder(projectId: string, name: string): Promise<void>;
	upload(projectId: string, files: File[], destination?: string): Promise<UploadProjectFilesResult>;
	delete(projectId: string, file: DeckFile): Promise<void>;
	rename(projectId: string, file: DeckFile, name: string): Promise<RenameResult>;
	move(projectId: string, fileId: string, destination: string): Promise<{ newFileId: string }>;
	fileUrl(projectId: string, fileId: string): string;
	exportUrl(projectId: string): string;
}

export function createProjectFilesClient(fetcher?: FetchLike): ProjectFilesClient;
export const projectFilesClient: ProjectFilesClient;
```

- [ ] **Step 1: Failing Adapter-Vertragstests schreiben**

Verwende kleine Fetch-Fakes, die echte `Response`-Objekte zurückgeben. Prüfe mindestens:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { API_URL } from "../../lib/config.ts";
import { createProjectFilesClient } from "./project-files-client.ts";

test("lists project files from the existing endpoint", async () => {
	const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
	const client = createProjectFilesClient(async (input, init) => {
		calls.push([input, init]);
		return Response.json({ files: [{ id: "slides.md", label: "slides.md", type: "markdown" }] });
	});

	assert.equal((await client.list("p1"))[0]?.id, "slides.md");
	assert.equal(calls[0]?.[0], `${API_URL}/projects/p1/files`);
});

test("moves a file with the unchanged PATCH payload", async () => {
	let captured: RequestInit | undefined;
	const client = createProjectFilesClient(async (_input, init) => {
		captured = init;
		return Response.json({ newFileId: "folder/slides.md" });
	});

	assert.deepEqual(await client.move("p1", "slides.md", "folder"), {
		newFileId: "folder/slides.md",
	});
	assert.equal(captured?.method, "PATCH");
	assert.deepEqual(JSON.parse(String(captured?.body)), { destination: "folder" });
});

test("preserves a backend error message", async () => {
	const client = createProjectFilesClient(async () =>
		Response.json({ error: "Name already exists" }, { status: 409 }),
	);
	await assert.rejects(() => client.createFile("p1", "slides.md"), {
		name: "ProjectFilesRequestError",
		message: "Name already exists",
	});
});
```

Ergänze einzelne Vertragstests für Folder-Create, Upload-Destination, Delete File/Folder, Rename File/Folder sowie segmentweise URL-Kodierung von `fileUrl`.

- [ ] **Step 2: RED verifizieren**

Run: `pnpm --filter vite-app test`

Expected: FAIL wegen fehlendem `project-files-client.ts`.

- [ ] **Step 3: Minimalen HTTP-Adapter implementieren**

Kopiere die existierenden Endpunkte und Payloads ohne Umbenennung. Eine interne Funktion liest `{ error?: string }` nur bei nicht erfolgreichen Responses. Netzwerkfehler bleiben unverändert und werden nicht in `ProjectFilesRequestError` umgewandelt.

Upload behält die existierende per-Datei-Schleife und das Resultat `{ uploadedAny, failures }` bei.

- [ ] **Step 4: GREEN verifizieren**

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
```

Expected: alle Adapter-Vertragstests PASS; Typecheck exit 0.

Checkpoint: Diff prüfen; nicht stagen oder committen.

---

### Task 5: Workspace-State und React-Koordination

**Files:**

- Create: `frontend/src/features/project-files/project-files-workspace-state.test.ts`
- Create: `frontend/src/features/project-files/project-files-workspace-state.ts`
- Create: `frontend/src/features/project-files/use-project-files-workspace.ts`
- Modify: `frontend/src/routes/presentations/$id.tsx:144-218, 885-927`
- Delete after successful migration: `frontend/src/hooks/use-files.ts`

**Interfaces:**

```ts
export type ProjectFilesDragState = {
	draggingFileId: string | null;
	dragOverPath: string | null;
};

export const emptyProjectFilesDragState: ProjectFilesDragState;
export function startProjectFileDrag(fileId: string): ProjectFilesDragState;
export function setProjectFileDragOver(
	state: ProjectFilesDragState,
	path: string | null,
): ProjectFilesDragState;
export function endProjectFileDrag(): ProjectFilesDragState;

export type ProjectFilesWorkspace = {
	projectId: string;
	files: DeckFile[];
	tree: FileTreeNode[];
	isLoading: boolean;
	error: string | null;
	reload(): Promise<void>;
	selectedFileId: string | null;
	selectFile(file: DeckFile): void;
	openFolders: Record<string, boolean>;
	setFolderOpen(path: string, open: boolean): void;
	presenceByFileId: ProjectFilePresenceById;
	dragState: ProjectFilesDragState;
	dropUploadDragOverPath: string | null;
	isUploadingDrop: boolean;
	dropUploadError: string | null;
	startDrag(fileId: string): void;
	endDrag(): void;
	setDragOverPath(path: string | null): void;
	setDropUploadDragOverPath(path: string | null): void;
	createFile(name: string): Promise<void>;
	createFolder(name: string): Promise<void>;
	uploadFiles(files: File[], destination?: string): Promise<UploadProjectFilesResult>;
	deleteFile(file: DeckFile): Promise<void>;
	renameFile(file: DeckFile, name: string): Promise<void>;
	moveFile(fileId: string, destination: string): Promise<void>;
	fileUrl(fileId: string): string;
	exportUrl(): string;
};
```

- [ ] **Step 1: Failing Drag-State-Tests schreiben**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	emptyProjectFilesDragState,
	endProjectFileDrag,
	setProjectFileDragOver,
	startProjectFileDrag,
} from "./project-files-workspace-state.ts";

test("starts, updates and ends an internal drag", () => {
	const started = startProjectFileDrag("slides.md");
	assert.deepEqual(started, { draggingFileId: "slides.md", dragOverPath: null });
	assert.deepEqual(setProjectFileDragOver(started, "folder"), {
		draggingFileId: "slides.md",
		dragOverPath: "folder",
	});
	assert.deepEqual(endProjectFileDrag(), emptyProjectFilesDragState);
});

test("keeps drag state identity when the target does not change", () => {
	const state = { draggingFileId: "slides.md", dragOverPath: "folder" };
	assert.equal(setProjectFileDragOver(state, "folder"), state);
});
```

- [ ] **Step 2: RED verifizieren**

Run: `pnpm --filter vite-app test`

Expected: FAIL wegen fehlendem Workspace-State-Module.

- [ ] **Step 3: Pure Drag-State-Implementation hinzufügen und GREEN verifizieren**

Run: `pnpm --filter vite-app test`

Expected: alle Tests PASS.

- [ ] **Step 4: `useProjectFilesWorkspace` implementieren**

Das Hook erhält:

```ts
type UseProjectFilesWorkspaceOptions = {
	projectId: string;
	selectedFile: DeckFile | null;
	onSelectFile(file: DeckFile): void;
	presenceAwareness: Awareness | null;
	currentUserId: string | null;
	client?: ProjectFilesClient;
};
```

Es ersetzt `useFiles`, leitet `tree` mit `buildFileTree` ab und verwendet ausschließlich die getesteten Reconciliation-Funktionen. Regeln:

- `reload` behält Loading- und Error-Texte von `useFiles` bei.
- erfolgreiche Befehle laden die Liste vollständig neu.
- `renameFile` reconciliiert Selection und offene Ordner vor dem Reload.
- `moveFile` beendet Drag-State vor dem Request, ignoriert denselben Parent und verschluckt Requestfehler wie bisher.
- `uploadFiles` lädt nur bei `uploadedAny` neu.
- der Selection-Effect verwendet `expandOpenFoldersForSelection`.

- [ ] **Step 5: Präsentationsroute auf Workspace umstellen**

Erzeuge `selectedFile` vor dem Hook und ersetze `useFiles(id)` durch:

```ts
const projectFiles = useProjectFilesWorkspace({
	projectId: id,
	selectedFile,
	onSelectFile: setSelectedFile,
	presenceAwareness: projectPresenceAwareness,
	currentUserId: presenceUser.userId,
});
const { files, isLoading, error, reload } = projectFiles;
```

Ordne die Hooks statisch in dieser Reihenfolge an:

1. `useState` für `selectedFile`
2. `useProjectPresence` mit der aktuellen Selection
3. `useProjectFilesWorkspace` mit der zurückgegebenen Awareness
4. `useCollabDocument`, dessen `files-changed`-Callback `projectFiles.reload()` aufruft

Kein Hook wird bedingt aufgerufen. `useProjectPresence` benötigt die Project-file-Liste nicht und kann deshalb vor dem Workspace-Module entstehen.

Übergib `projectFiles` an `FileSidebar`; Search-, Outline-, Theme- und Project-settings-Properties bleiben separat.

- [ ] **Step 6: Alten Listen-Hook entfernen und Zwischenstand verifizieren**

Lösche `frontend/src/hooks/use-files.ts`, sobald kein Import mehr existiert.

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
pnpm lint
```

Expected: Tests PASS; Typecheck und Lint exit 0.

Checkpoint: Diff prüfen; nicht stagen oder committen.

---

### Task 6: Dialoge auf Workspace-Befehle umstellen

**Files:**

- Modify: `frontend/src/components/dialog/create-file.tsx`
- Modify: `frontend/src/components/dialog/create-folder.tsx`
- Modify: `frontend/src/components/dialog/upload-file.tsx`
- Modify: `frontend/src/components/dialog/delete-file.tsx`
- Modify: `frontend/src/components/dialog/rename-file.tsx`
- Modify/Create: `frontend/src/features/project-files/project-files-panel.tsx`
- Delete after successful migration: `frontend/src/lib/upload-files.ts`

**Interfaces:**

```ts
type CreateFileDialogProps = {
	open: boolean;
	onOpenChange(open: boolean): void;
	onCreate(name: string): Promise<void>;
};

type CreateFolderDialogProps = {
	open: boolean;
	onOpenChange(open: boolean): void;
	onCreate(name: string): Promise<void>;
};

type UploadFileDialogProps = {
	open: boolean;
	onOpenChange(open: boolean): void;
	onUpload(files: File[]): Promise<UploadProjectFilesResult>;
};

type DeleteFileDialogProps = {
	file: DeckFile | null;
	open: boolean;
	onOpenChange(open: boolean): void;
	onDelete(file: DeckFile): Promise<void>;
};

type RenameFileDialogProps = {
	file: DeckFile | null;
	open: boolean;
	onOpenChange(open: boolean): void;
	onRename(file: DeckFile, name: string): Promise<void>;
};
```

- [ ] **Step 1: Dialoge unter grünen Adapter-/Workspace-Tests refactoren**

Entferne `API_URL`, `fetch`, `projectId`, `onCreated`, `onUploaded`, `onDeleted`, `onRenamed` und `uploadProjectFiles` aus den Dialogen. Ersetze nur den Request-Block durch den jeweiligen asynchronen Callback.

Fehlerbehandlung:

```ts
function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof ProjectFilesRequestError ? error.message : fallback;
}
```

Die bisherigen Fallback-Texte bleiben pro Dialog exakt erhalten.

- [ ] **Step 2: `ProjectFilesPanel` als Dialog-Host implementieren**

Verschiebe diese Zustände aus `FileSidebar`:

```ts
const [createFileOpen, setCreateFileOpen] = useState(false);
const [createFolderOpen, setCreateFolderOpen] = useState(false);
const [uploadFileOpen, setUploadFileOpen] = useState(false);
const [fileToDelete, setFileToDelete] = useState<DeckFile | null>(null);
const [fileToRename, setFileToRename] = useState<DeckFile | null>(null);
const [previewImageFile, setPreviewImageFile] = useState<DeckFile | null>(null);
```

Das Module erhält genau:

```ts
type ProjectFilesPanelProps = {
	workspace: ProjectFilesWorkspace;
};
```

Es verbindet Dialoge mit `workspace.createFile`, `createFolder`, `uploadFiles`, `deleteFile` und `renameFile`.

- [ ] **Step 3: Alten Upload-Helper entfernen**

Lösche `frontend/src/lib/upload-files.ts`, sobald `rg 'uploadProjectFiles' frontend/src` keine Caller mehr meldet.

- [ ] **Step 4: Verhalten verifizieren**

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
pnpm lint
```

Expected: Tests PASS; Typecheck und Lint exit 0.

Checkpoint: Diff prüfen; nicht stagen oder committen.

---

### Task 7: Rekursive Ansicht mit internem Context und Sidebar-Shell

**Files:**

- Create: `frontend/src/features/project-files/file-tree-view.tsx`
- Create: `frontend/src/features/project-files/image-preview-dialog.tsx`
- Modify: `frontend/src/features/project-files/project-files-panel.tsx`
- Modify: `frontend/src/components/file-sidebar.tsx`

**Interfaces:**

```ts
type FileTreeViewProps = {
	workspace: ProjectFilesWorkspace;
	onPreviewImage(file: DeckFile): void;
	onDeleteFile(file: DeckFile): void;
	onRenameFile(file: DeckFile): void;
};
```

`FileTreeItem` bleibt nicht exportiert. Sein interner Context enthält Selection, Presence, Folder-, Drag- und Action-State.

- [ ] **Step 1: Bestehende Tests als Refactor-Gate ausführen**

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
```

Expected: alles grün vor der JSX-Extraktion.

- [ ] **Step 2: File-tree-Ansicht verschieben**

Verschiebe `FilePresenceDots`, `FileTreeAction` und `NestedFileItem` nach `file-tree-view.tsx`. Ersetze die 18 Properties durch einen internen Context:

```ts
type FileTreeContextValue = Pick<
	ProjectFilesWorkspace,
	| "selectedFileId"
	| "selectFile"
	| "openFolders"
	| "setFolderOpen"
	| "presenceByFileId"
	| "dragState"
	| "dropUploadDragOverPath"
	| "startDrag"
	| "endDrag"
	| "setDragOverPath"
	| "moveFile"
> & {
	onPreviewImage(file: DeckFile): void;
	onDeleteFile(file: DeckFile): void;
	onRenameFile(file: DeckFile): void;
	onExternalFileDragOverPath(event: React.DragEvent, path: string): boolean;
	onExternalFileDragLeave(event: React.DragEvent): void;
	onExternalFileDropOnPath(event: React.DragEvent, path: string): boolean;
};
```

Root-Drop, Loading-, Error- und Empty-State bleiben in `FileTreeView`; die rekursive Implementation konsumiert den Context.

- [ ] **Step 3: Bildvorschau verschieben**

Verschiebe `ImagePreviewDialog` unverändert nach `image-preview-dialog.tsx`. Die URL kommt über `workspace.fileUrl(file.id)`; das Module kennt `API_URL` nicht.

- [ ] **Step 4: `FileSidebar` zur Shell reduzieren**

`FileSidebar` behält:

- Workspace-Panel-Auswahl und Hotkeys
- mobile/desktop Rail
- Search- und Outline-Slots
- unverändertes Settings-Panel
- SidebarProvider und Layout

Es erhält `workspace: ProjectFilesWorkspace` anstelle der bisherigen Project-file-Properties. Es enthält danach keine Fetch-, Upload-, Move-, Rename-, Tree-, Presence- oder Dialog-Implementation.

- [ ] **Step 5: Refactor-Gate erneut ausführen**

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
pnpm lint
pnpm format:check
```

Expected: alle Befehle exit 0.

Checkpoint: `wc -l frontend/src/components/file-sidebar.tsx` dokumentieren und gesamten Diff prüfen. Nicht stagen oder committen.

---

### Task 8: Gesamte Verhaltensabsicherung

**Files:**

- Verify only: alle geänderten Frontend-Dateien
- Verify only: `e2e/tests/main.test.ts`

**Interfaces:** Keine neuen Interfaces; dieser Task validiert die Akzeptanzkriterien.

- [ ] **Step 1: Verbotene alte Kopplungen suchen**

Run:

```bash
rg -n 'API_URL|fetch\(|uploadProjectFiles|RenameResult|buildNestedFileTree|getFilePresenceById' frontend/src/components/file-sidebar.tsx frontend/src/components/dialog frontend/src/hooks frontend/src/lib
```

Expected:

- keine Project-file-Endpunkte in `file-sidebar.tsx` oder den fünf Dialogen
- kein `uploadProjectFiles`
- keine private Tree-/Presence-Implementation in `file-sidebar.tsx`
- Project-unabhängige Fetches in anderen Modulen dürfen bestehen bleiben

- [ ] **Step 2: Vollständige statische Frontend-Verifikation**

Run:

```bash
pnpm --filter vite-app test
pnpm --filter vite-app typecheck
pnpm lint
pnpm format:check
pnpm --filter vite-app build
```

Expected: alle Befehle exit 0, keine Warnungen oder Fehler.

- [ ] **Step 3: Relevante Playwright-Tests ausführen**

Run:

```bash
pnpm --filter e2e test --grep "file management|file upload|settings panel|outline panel|search panel|presence"
```

Expected: alle ausgewählten Tests PASS. Falls der Docker-Stack wegen lokaler Umgebung nicht startet, den genauen Infrastrukturfehler dokumentieren und keine Erfolgsaussage zu E2E machen.

- [ ] **Step 4: Akzeptanzkriterien und Working Tree prüfen**

Run:

```bash
git diff --check
git status --short
wc -l frontend/src/components/file-sidebar.tsx 'frontend/src/routes/presentations/$id.tsx'
```

Expected:

- nur die geplanten uncommitted Dateien sind geändert oder neu
- keine Dateien sind gestaged
- `frontend/src/components/ui/sidebar.tsx` ist unverändert
- `FileSidebar` ist deutlich kleiner und besitzt keine Project-file-Implementation mehr

Abschluss: dem Benutzer den uncommitted Diff, alle ausgeführten Checks und etwaige E2E-Infrastrukturgrenzen zur Review übergeben. Nicht stagen, nicht committen, nicht pushen.
