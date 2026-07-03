# button

2026-07-03, golden pair via shadcn CLI (`shadcn add button --overwrite`,
style flipped to `base-mira`). Pristine wrapper, migrated to the REAL
`@base-ui/react/button` primitive (not a hand-rolled `useRender` wrapper, per
the correction in the migration knowledge base — Base UI ships a native
Button that accepts `render` directly).

## Changed

- `frontend/src/components/ui/button.tsx`: `Slot`/`asChild` idiom removed;
  `Comp = asChild ? Slot.Root : "button"` -> `<ButtonPrimitive>` from
  `@base-ui/react/button`. Props type `React.ComponentProps<"button"> & { asChild? }`
  -> `ButtonPrimitive.Props`. Dropped `data-variant`/`data-size` DOM attributes
  (stock base-mira behavior, not something this project's CSS depended on —
  verified no `[data-variant]`/`[data-size]` selectors exist elsewhere).
  One real (non-structural) diff from stock: `secondary` variant's hover
  background changed from `hover:bg-secondary/80` to
  `hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]` —
  this is the base-mira registry's own updated token, present identically in
  both the original project file's CLI-resolved output and stock, so it's a
  registry evolution, not a user customization lost.
- Re-fetched twice more as a dependency of `button-group`, `dialog`, and
  `sidebar`; each re-fetch was byte-identical (post-format) to the first
  pass, confirming no drift.

Leftover scan: clean.

## Left alone

Every other UI wrapper that renders a `<Button>` (dialog, sheet, sidebar,
mode-toggle, all `dialog/*.tsx` consumers) needed its OWN `asChild -> render`
fix at the call site — those are documented in each of those reports, not
here, since `button.tsx`'s own code didn't need touching beyond the
primitive swap.

## Behavior changes

None expected. `asChild` callers now use `render`; behavior (click, focus,
disabled state) is unchanged since Base UI's Button merges props onto the
rendered element the same way Radix's Slot did.

## Verify by hand

Click through a few buttons of each variant (default, outline, secondary,
ghost, destructive) and confirm hover/focus/disabled states look right,
especially the `secondary` hover tint change.
