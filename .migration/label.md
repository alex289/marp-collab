# label

2026-07-03, golden pair via shadcn CLI (`shadcn add label --overwrite`,
style flipped to `base-mira`). Pristine wrapper.

## Changed

- `frontend/src/components/ui/label.tsx`: per the hard rule, Radix's `Label`
  primitive has no Base UI counterpart. `LabelPrimitive.Root` (from
  `radix-ui`) -> native `<label>`; type
  `React.ComponentProps<typeof LabelPrimitive.Root>` -> `React.ComponentProps<"label">`.
  Styling (`data-slot="label"`, `peer-disabled:*` classes) unchanged.

Leftover scan: clean.

## Left alone

Nothing.

## Behavior changes

None — Radix's `Label.Root` was already just a thin wrapper over `<label>`
with no extra ARIA/behavior beyond click-to-focus, which native `<label>`
gives you for free.

## Verify by hand

Confirm form field labels (e.g. "Name", "Slide theme") still render and
associate correctly with their inputs via `htmlFor`.
