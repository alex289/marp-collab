# Domain Context

## Project

A Project is an owned collaborative Marp workspace. It has metadata in SQLite and Project Content in local Project Storage.

## Project Content

Project Content is the file and folder tree belonging to one Project. Editable Markdown and CSS files can have persisted collaboration state; assets do not.

## Project Document

A Project Document identifies editable Project Content with the canonical name `project/{projectId}/{fileId}`. Formatting and parsing this identity must have one Implementation shared by Storage, Hocuspocus, connection tracking, and Project events.

## Project Access

Project Access answers whether a user may read, write, or manage collaborators for a Project. Owners may perform every action, read-write collaborators may read and write, and read-only collaborators may only read.

## Collaborator Membership

Collaborator Membership links a user to a Project with a read-only flag. Changing or removing Membership invalidates affected live collaboration connections so that access is re-evaluated.

## Project Storage

Project Storage persists Project Content below a Project-specific directory. Path containment, `.yjs` companion state, archive creation, and filesystem paths are Implementation details and must not leak through its Interface.

## Project Event

A Project Event notifies active Project Documents that the Project Content tree changed.

## PDF Export

PDF Export renders one Markdown Project Document with its local themes and assets, then submits the rendered input to Gotenberg. This refactoring characterizes the existing workflow but does not redesign it.
