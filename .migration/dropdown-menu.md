# dropdown-menu

2026-07-03, golden pair via shadcn CLI (`shadcn add dropdown-menu --overwrite`,
style flipped to `base-mira`). Pristine wrapper; canonical
DropdownMenu -> Menu restructure.

## Changed

- `frontend/src/components/ui/dropdown-menu.tsx`: `radix-ui` DropdownMenu ->
  `@base-ui/react/menu`. Part renames: `Content` -> `Portal > Positioner >
  Popup`, `Label` -> `GroupLabel`, `ItemIndicator` ->
  `CheckboxItemIndicator`/`RadioItemIndicator`, `Sub`/`SubTrigger` ->
  `SubmenuRoot`/`SubmenuTrigger`. `side`/`align`/`sideOffset`/`alignOffset`
  moved from Content onto the new `Positioner` (forwarded explicitly per the
  "Pick means forward" rule — verified `DropdownMenuContent` and
  `DropdownMenuSubContent` both destructure and pass these through, not
  leaking onto `Popup` via `...props`).
- `frontend/src/components/mode-toggle.tsx:19-32`: consumer sweep — nested
  `<TooltipTrigger asChild><DropdownMenuTrigger asChild><Button>...</Button></DropdownMenuTrigger></TooltipTrigger>`
  -> nested `render` props (`TooltipTrigger render={<DropdownMenuTrigger render={<Button>...} />}`).

Leftover scan: clean.

## Left alone

Nothing else in the project uses `DropdownMenu*` besides `mode-toggle.tsx`.

## Behavior changes

- **FLAG**: Base UI's `CheckboxItem`/`RadioItem` default `closeOnClick` to
  `false` (Radix defaulted to closing the menu on select). Not observed to
  matter here — this project's dropdown menu (theme switcher) uses plain
  `DropdownMenuItem`, not checkbox/radio items, so the behavior delta doesn't
  currently apply, but flag it if checkbox/radio items are added later.

## Verify by hand

Open the theme dropdown (moon/sun icon in the navbar), confirm keyboard
navigation (arrow keys, Enter) and typeahead work, and that both the tooltip
("Toggle theme (D)") and the menu itself trigger correctly from the same
button.
