# separator

2026-07-03, golden pair via shadcn CLI (`shadcn add separator --overwrite`,
style flipped to `base-mira`). Pristine wrapper. This was the first
component migrated and used to validate the CLI golden-pair workflow before
running it across the rest of the project.

## Changed

- `frontend/src/components/ui/separator.tsx`: `radix-ui` Separator ->
  `@base-ui/react/separator`. Single-part primitive, so `Separator.Root`
  became the callable `Separator` import itself. `decorative` prop dropped
  (per the hard rule — no Base UI equivalent; confirmed unused by every
  consumer via `grep -rn "decorative" src/`). Type
  `React.ComponentProps<typeof SeparatorPrimitive.Root>` ->
  `SeparatorPrimitive.Props`.
- Re-fetched twice more as a dependency of `button-group` and `sidebar`;
  both re-fetches were byte-identical (post-format) to the original pass.

Leftover scan: clean.

## Left alone

Nothing.

## Behavior changes

None — `decorative` (which only affects the ARIA role, hiding the separator
from the accessibility tree) was never set explicitly anywhere in this
codebase, so dropping it has no observable effect.

## Verify by hand

Confirm horizontal/vertical separators still render correctly in dropdown
menus, button groups, and the sidebar.
