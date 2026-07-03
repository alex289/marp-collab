# select

2026-07-03, golden pair via shadcn CLI (`shadcn add select --overwrite`,
style flipped to `base-mira`). Pristine wrapper; canonical Select restructure.

## Changed

- `frontend/src/components/ui/select.tsx`: `radix-ui` Select ->
  `@base-ui/react/select`. `Label` -> `GroupLabel`, `Viewport` -> `List`,
  `ScrollUpButton`/`ScrollDownButton` -> `ScrollUpArrow`/`ScrollDownArrow`.
  `Icon`/`ItemIndicator` (`SelectTrigger`'s chevron, `SelectItem`'s
  check icon) went `asChild` -> `render` internally
  (`select.tsx:49,121`). `position="popper"|"item-aligned"` ->
  `alignItemWithTrigger` boolean (default `true`), forwarded from
  `SelectContent` to the Positioner (`select.tsx:62-76`, verified it's
  destructured and passed, not leaking via `...props`).
- `frontend/src/components/dialog/manage-project-collaborator.tsx:211-215`
  and `frontend/src/components/file-sidebar.tsx:811-815`: consumer sweep —
  Base UI's `Select.Root.onValueChange` widens from `(value: string) => void`
  to `(value: Value | null, eventDetails) => void`. Fixed both call sites:
  - `manage-project-collaborator.tsx`: `onValueChange={setAccessLevel}` ->
    `onValueChange={(value) => setAccessLevel(value ?? "read-only")}` (state
    stays `string`, since this select always has a value selected).
  - `file-sidebar.tsx` (theme select): `onValueChange={onThemeChange}` ->
    `onValueChange={(value) => value && onThemeChange(value)}` (guards the
    `onThemeChange: (theme: string) => void` prop, which the parent expects
    to only ever receive a real theme name).

Leftover scan: clean.

## Left alone

Nothing else in the project uses `Select`.

## Behavior changes

None expected beyond the `onValueChange` nullability, which is now handled
at both call sites without changing any public prop types on
`FileSidebar`/`ManageProjectCollaboratorDialog`.

## Verify by hand

- Collaborator dialog: change the access-level select between "Read-only"
  and "Full access", confirm it updates and submits correctly.
- File sidebar settings panel: change the slide theme select, confirm the
  live preview updates and no theme can be set to a blank/null value.
- Confirm keyboard nav (arrow keys, Enter, typeahead) still works in both.
