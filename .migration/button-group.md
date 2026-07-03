# button-group

2026-07-03, golden pair via shadcn CLI + hand merge (style flipped to
`base-mira`). CUSTOMIZED wrapper — the CLI `--overwrite` first clobbered a
real project customization, caught by diffing the pre-overwrite file against
stock radix-mira, then restored via `git merge-file` three-way merge
(radix-mira as the common ancestor).

## Changed

- `frontend/src/components/ui/button-group.tsx`: `radix-ui` Slot/`asChild`
  idiom on `ButtonGroupText` -> `useRender` + `mergeProps` (non-button
  polymorphic pattern, same as `badge.tsx`). `ButtonGroup`'s root class list
  lost the unused `group/button-group` marker class (dead in both old and
  new registry versions — grepped the whole project, no `group-*` selector
  ever referenced it) and the horizontal/vertical corner-rounding selectors
  were rewritten from `:not(:first-child)`/`:not(:last-child)` to
  `*:data-slot:` + `~[data-slot]` sibling selectors (mechanical Tailwind
  authoring change, same resulting CSS).
  - **Customization preserved**: this project's button-group uses
    `rounded-lg`/`text-sm` where the stock base-mira template (and the CLI's
    raw `--overwrite` output) uses `rounded-md`/`text-xs/relaxed`. Confirmed
    this was deliberate, not drift: `rounded-lg` is the project's
    established radius token for popover/panel-like surfaces (same value
    used in `card.tsx`, `alert.tsx`, `dropdown-menu.tsx`'s popup,
    `select.tsx`'s popup, `sidebar.tsx`'s floating variant — see
    `frontend/src/index.css:44-50` for the `--radius-*` scale). Restored by
    hand at `button-group.tsx:9,13,15,47` after the `--overwrite` pass
    replaced it with the generic stock value.

Leftover scan: clean.

## Left alone

Nothing — `ButtonGroupSeparator` just re-exports the already-migrated
`Separator` (see [separator.md](separator.md)), no changes needed there.

## Behavior changes

None — the corner-rounding selector rewrite is visually equivalent (both
old and new selectors round only the group's outer corners, not each
button's).

## Verify by hand

`ButtonGroup` wraps the presenter timer's pause/resume + reset buttons in
presentation mode (`frontend/src/routes/presentations/$id.tsx:724-735`).
Enter present mode, confirm the two buttons render as a visually joined
group with rounded outer corners (`rounded-lg`, matching the rest of the
app's panels/popups, not a smaller/sharper radius), and that clicking
pause/resume and reset both still work.
