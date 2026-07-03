# dialog

2026-07-03, golden pair via shadcn CLI (`shadcn add dialog --overwrite`,
style flipped to `base-mira`). Pristine wrapper. Confirmed against the
project's original file: only differences from stock radix-mira were the
RSC pragma, icon resolution, and an unused `cn-font-heading` preset token
(this project's `components.json` config resolves to plain `font-heading` in
both the original and the new CLI output) — no user customizations lost.

## Changed

- `frontend/src/components/ui/dialog.tsx`: `radix-ui` Dialog ->
  `@base-ui/react/dialog`. `Overlay` -> `Backdrop`, `Content` -> `Popup`
  (centered modal — no `Positioner`, matching the "Content -> Popup, no
  Positioner for centered modals" rule). `Close` kept, internal `asChild` ->
  `render` wrapping the close `Button`.
- Consumer sweep, `asChild` -> `render` across every dialog usage in the app:
  - `frontend/src/components/dialog/create-file.tsx:93`,
    `create-folder.tsx:92`, `create-presentation.tsx:93`,
    `delete-file.tsx:81`, `delete-project.tsx:97`,
    `rename-project.tsx:120`, `upload-file.tsx:90`: `DialogClose asChild`
    wrapping a Cancel `Button` -> `DialogClose render={<Button>...}`.
  - `create-presentation.tsx:67`, `manage-project-collaborator.tsx:133`,
    `rename-project.tsx:76`: `DialogTrigger asChild` wrapping a `Button` ->
    `DialogTrigger render={<Button>...}`.
  - `delete-project.tsx:66-83`: `DialogTrigger asChild` wraps a
    `trigger ?? <Button>...</Button>` conditional. Narrowed the component's
    `trigger` prop type from `ReactNode` to `ReactElement` (delete-project.tsx:21)
    since `render` requires a `ReactElement | ((props, state) => ReactElement)`,
    not the broader `ReactNode` — verified both call sites
    (`file-sidebar.tsx:841`, default/no-trigger in `routes/index.tsx:98`)
    only ever pass a `Button` element or omit the prop, so the narrowing is
    safe.

Leftover scan: clean.

## Left alone

`showCloseButton` prop on `DialogContent`/`DialogFooter` is untouched —
still a plain boolean, not a Radix/Base UI concept.

## Behavior changes

None expected — `render` merges the same click/keyboard handlers onto the
target element that `asChild`'s `Slot` did.

## Verify by hand

Open every dialog in the app (create file/folder/presentation, rename
project, delete file/project, upload file, manage collaborators) and
confirm: trigger opens it, Cancel/close-button/backdrop/Escape all close it,
and focus returns to the trigger on close.
