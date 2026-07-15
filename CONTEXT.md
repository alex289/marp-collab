# Domain Context

## Project

Eine kollaborative Marp-Präsentation mit einer stabilen ID, einem Namen, einem Besitzer und mehreren Project files.

## Project file

Eine Datei innerhalb eines Project. Ein Project file ist Markdown, Asset oder expliziter Ordner. Seine `id` ist zugleich der normalisierte, projekt-relative Pfad.

## File tree

Die hierarchische Darstellung aller Project files. Implizite Ordner entstehen aus Pfadsegmenten; `.keep` bleibt unsichtbar. Ordner werden vor Dateien und Einträge innerhalb ihrer Gruppe alphabetisch sortiert.

## File selection

Das aktuell im Editor geöffnete Project file. Umbenennen oder Verschieben muss die File selection auf die neue ID abbilden, ohne das ausgewählte Dokument zu wechseln.

## Project-files workspace

Das Frontend-Module, das Project files lädt, den File tree ableitet, Mutationen ausführt und die daraus folgenden Änderungen an File selection und geöffneten Ordnern zusammenhängend behandelt.
