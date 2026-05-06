export type DeckFile = {
  id: string;
  label: string;
};

export const PROJECT_ID = "main";
const FILE_PREFIX = `project/${PROJECT_ID}/`;

export const deckFiles: DeckFile[] = [
  { id: "slides/welcome.md", label: "slides/welcome.md" },
  { id: "slides/agenda.md", label: "slides/agenda.md" },
  { id: "notes/speaker-notes.md", label: "notes/speaker-notes.md" },
];

const initialFileContent: Record<string, string> = {
  "slides/welcome.md": `---
marp: true
theme: default
paginate: true
---

# Realtime Marp Collaboration

Willkommen im gemeinsamen Deck.

---

## Presence

- Jede Cursor-Position ist live sichtbar
- Änderungen werden sofort synchronisiert
`,
  "slides/agenda.md": `---
marp: true
paginate: true
---

# Agenda

1. Authentifizierung
2. Realtime Editor
3. Live Preview
4. Q&A
`,
  "notes/speaker-notes.md": `# Speaker Notes

- Vor dem Talk: Check der Demo
- Während des Talks: Cursor-Presence zeigen
`,
};

export const toDocumentName = (fileId: string): string => `${FILE_PREFIX}${fileId}`;

export const initialDocumentContent = new Map<string, string>(
  deckFiles.map((file) => [toDocumentName(file.id), initialFileContent[file.id] ?? ""]),
);
