# Project-files Refactoring Design

## Ziel

Der Project-files-Workflow wird aus `frontend/src/components/file-sidebar.tsx`, `frontend/src/hooks/use-files.ts` und den Datei-Dialogen in ein tiefes Module überführt. Das sichtbare Verhalten, die Backend-Endpunkte und die Benutzerabläufe bleiben unverändert.

## Ausgangslage

`file-sidebar.tsx` umfasst 1.419 Zeilen und verbindet mehrere Invarianten:

- Aufbau und Sortierung des File tree
- geöffnete Ordner und automatische Expansion
- interne Drag-and-drop-Moves
- externe Upload-Drops
- Umbenennung von Dateien und Ordnern
- Reconciliation von File selection und geöffneten Ordnern
- Project-file Presence
- Dialog- und Panelzustände

`NestedFileItem` erhält 18 Properties und reicht sie bei jeder Rekursion erneut weiter. Dateioperationen liegen zusätzlich in `use-files.ts`, `upload-files.ts` und fünf Dialog-Modulen. Nach Mutationen wird über `onRetry` neu geladen; die anschließende Reconciliation liegt teilweise in der Route und teilweise in der Sidebar.

## Scope

Dieses Design umfasst ausschließlich den Project-files-Workflow:

- File tree und Pfadregeln
- Laden und Aktualisieren der Project-file-Liste
- Erstellen, Upload, Umbenennen, Verschieben und Löschen
- File selection nach Move oder Rename
- geöffnete Ordner nach Selection oder Folder-Rename
- interner und externer Drag-and-drop-State
- Project-file Presence als abgeleitete Ansichtsdaten
- Aufteilung der Sidebar in fokussierte interne Module

## Nicht-Ziele

- keine Änderung an Backend-Endpunkten oder Payloads
- keine neue Project-file-Funktionalität
- kein optimistisches Update
- kein globaler Frontend-Store
- keine Änderung an Suche, Outline, Themes oder Project settings
- keine Umgestaltung der sichtbaren Sidebar
- keine Änderung an `frontend/src/components/ui/sidebar.tsx`
- keine neue Runtime- oder Test-Abhängigkeit, sofern Node 24 die Charakterisierungstests ausführen kann

## Gewählter Ansatz

Der Workflow wird vertikal nach Domänenverhalten gegliedert. Ein Project-files workspace Module besitzt das Laden, die Mutationsbefehle und die Reconciliation. Pure Module kapseln Pfad- und Zustandsübergänge. Die React-Ansicht konsumiert dieses Verhalten, ohne Endpunkte, Reload-Reihenfolge oder Dokumentnamenskonventionen zu kennen.

Ein bloßes Verschieben von JSX in kleinere Dateien wird vermieden: Eine Extraktion gilt nur dann als sinnvoll, wenn ihr Interface kleiner ist als ihre Implementation und der Deletion Test zeigt, dass ihre Logik sonst an mehrere Caller zurückfallen würde.

## Module und Verantwortlichkeiten

### `features/project-files/file-tree.ts`

Pure Implementation für:

- Pfadnormalisierung
- Aufbau des verschachtelten File tree
- Filterung von `.keep`
- Ordner-vor-Datei-Sortierung
- Ermittlung von Parent- und Ancestor-Pfaden

Das Interface besteht aus Project files als Eingabe und stabilen Baum-/Pfadergebnissen als Ausgabe. Es kennt weder React noch Netzwerkzugriffe.

### `features/project-files/file-reconciliation.ts`

Pure Implementation für Zustandsübergänge nach Mutationen:

- ausgewähltes Project file nach File-Rename
- ausgewähltes Project file nach Folder-Rename
- ausgewähltes Project file nach Move
- offene Ordner nach Folder-Rename
- Ancestor-Expansion nach einer Selection

Die Implementation bewahrt `label` und bei Markdown-Dateien die `documentName`-Konvention `project/{projectId}/{fileId}`.

### `features/project-files/project-files-client.ts`

Der HTTP-Adapter enthält die existierenden Endpunkte und Payloads für Listen, Erstellen, Upload, Umbenennen, Verschieben und Löschen. Fehler werden als fehlgeschlagene Befehle zurückgegeben oder geworfen; die sichtbaren Fehlermeldungen bleiben bei den bisherigen Callern.

Der Adapter ändert keine Cache- oder Retry-Semantik. Nach erfolgreichen Mutationen wird weiterhin die vollständige Project-file-Liste geladen.

### `features/project-files/use-project-files-workspace.ts`

Das tiefe React-Module koordiniert:

- Dateien, Loading- und Error-State
- initiales und explizites Reload
- Project-file-Befehle über den HTTP-Adapter
- Reconciliation nach Move und Rename
- geöffnete Ordner
- internen und externen Drag-and-drop-State

Die File selection bleibt Eigentum der Präsentationsroute, weil sie den kollaborativen Dokumentwechsel auslöst. Das Workspace-Module erhält die aktuelle Selection und meldet genau eine reconciliierte Selection zurück, wenn eine Mutation deren ID verändert.

### `features/project-files/file-tree-view.tsx`

Die rekursive Ansicht rendert Dateien, Assets und Ordner. Ein interner React-Context stellt den rekursiven Einträgen Baumzustand und Aktionen bereit, sodass die Rekursion nicht mehr 18 Properties weiterreicht. Dieser Context ist eine interne Seam und wird nicht außerhalb des Project-files Module exportiert.

### `features/project-files/project-file-presence.ts`

Die Awareness-Daten werden einmal validiert und als Teilnehmer pro File-ID abgeleitet. Die Ansicht erhält keine rohe Yjs-`Awareness`-Struktur. Die Hocuspocus-/Yjs-Implementation bleibt hinter dieser Seam.

### Sidebar-Shell

`FileSidebar` bleibt das öffentliche Module der Workspace-Navigation. Es setzt Files-, Search-, Outline- und Settings-Panel zusammen. Project-file-spezifische Implementation wird aus der Shell entfernt; Rail, Dialog-Hosts und Project-file-Ansicht dürfen als interne, fokussierte Dateien bestehen, wenn ihre Interfaces klein bleiben.

## Datenfluss

### Initiales Laden

1. Die Präsentationsroute stellt `projectId` und aktuelle File selection bereit.
2. Das Workspace-Module lädt Project files über den HTTP-Adapter.
3. Das File-tree Module leitet den File tree ab.
4. Fehlt die aktuelle Selection, wählt die Route weiterhin das bisherige bevorzugte Standard-Project-file.
5. Die Ancestors der Selection werden geöffnet.

### Move

1. Die Ansicht meldet Quell-ID und Zielordner an das Workspace-Module.
2. Das Workspace-Module ignoriert Moves in denselben Parent-Ordner wie bisher.
3. Der HTTP-Adapter führt den bestehenden `PATCH`-Request aus.
4. Bei Erfolg wird eine betroffene File selection auf die neue ID reconciliiert.
5. Anschließend wird die Project-file-Liste neu geladen.
6. Bei Fehler bleibt die Selection unverändert; der Drag-State wird trotzdem beendet.

### Rename

1. Der Dialog sammelt ausschließlich den neuen Namen.
2. Das Workspace-Module führt File- oder Folder-Rename aus.
3. File selection und offene Ordner werden anhand des zurückgegebenen Pfades reconciliiert.
4. Anschließend wird die Project-file-Liste neu geladen.

### Upload und Delete

Upload und Delete verwenden die bisherigen Endpunkte und Fehlermeldungen. Nach mindestens einem erfolgreichen Upload beziehungsweise erfolgreichem Delete lädt das Workspace-Module die Liste neu. Eine nicht betroffene Selection bleibt unverändert.

## Fehlerbehandlung

- Bestehende Dialogfehlermeldungen und Upload-Fehlertexte bleiben erhalten.
- Ein fehlgeschlagener Move verändert weder Selection noch offene Ordner.
- Drag-and-drop-State wird nach Erfolg und Fehler deterministisch zurückgesetzt.
- Teilweise erfolgreiche Multi-Uploads laden die Liste neu und zeigen weiterhin alle fehlgeschlagenen Dateinamen.
- Parsing ungültiger Awareness-Felder verwirft nur den ungültigen Teilnehmer.
- Die Sidebar zeigt weiterhin Loading-, Retry- und Empty-State.

## Teststrategie

### Charakterisierungstests vor Production Code

Node-Tests werden vor jeder Extraktion geschrieben und müssen zunächst fehlschlagen, weil das gewünschte neue Module noch nicht existiert. Sie prüfen:

- Normalisierung von Slash-Varianten
- `.keep`-Filterung
- implizite und explizite Ordner
- Ordner-vor-Datei-Sortierung
- Ancestor- und Parent-Pfade
- File-, Folder- und Move-Reconciliation
- Umbenennung offener Unterordner
- Drag-State-Übergänge
- Presence-Validierung, Deduplizierung und Sortierung

### Bestehende Verhaltensabsicherung

Die bestehenden Playwright-Tests bleiben unverändert und sichern Erstellen, Löschen, Rename, Upload, Folder-Drop, Bildvorschau und Presence. Nach jedem in sich geschlossenen Refactoring-Schritt laufen mindestens:

- Frontend-Unit-Tests
- `pnpm --filter vite-app typecheck`
- `pnpm lint`
- `pnpm format:check`

Zum Abschluss laufen die relevanten Playwright-Spezifikationen, sofern der Docker-basierte E2E-Stack verfügbar ist.

## Reihenfolge

1. Node-basierten Frontend-Testbefehl ergänzen.
2. File-tree- und Pfadregeln testgetrieben extrahieren.
3. Reconciliation testgetrieben extrahieren.
4. Presence-Ableitung testgetrieben extrahieren.
5. HTTP-Adapter und Workspace-Koordination hinter vorhandenen Dialogabläufen einführen.
6. Rekursive Ansicht auf internen Context umstellen.
7. Sidebar-Shell von Project-file-Implementation befreien.
8. Gesamte Frontend- und relevante E2E-Absicherung ausführen.

Jeder Schritt muss für sich typprüfbar und formatierbar sein. Keine Phase darf gleichzeitig sichtbares Verhalten verändern.

## Akzeptanzkriterien

- Alle bestehenden Frontend- und relevanten E2E-Abläufe verhalten sich unverändert.
- Kein Project-file-Endpunkt und kein Payload ändert sich.
- `NestedFileItem` reicht nicht mehr den vollständigen Aktions- und Drag-State rekursiv weiter.
- Pfad-, Reconciliation- und Presence-Regeln sind über öffentliche Module-Interfaces direkt testbar.
- Datei-Dialoge kennen keine Project-file-Endpunkte mehr.
- `FileSidebar` enthält keine Fetch-, Upload-, Move- oder Rename-Reconciliation-Implementation mehr.
- `frontend/src/components/ui/sidebar.tsx` bleibt unverändert.
- Typecheck, Lint und Format-Check sind sauber.
