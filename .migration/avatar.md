# avatar

2026-07-03, golden pair via shadcn CLI (`shadcn add avatar --overwrite`, style
flipped to `base-mira`). Pristine wrapper, straight swap to Base UI's Avatar
primitive.

## Changed

- `frontend/src/components/ui/avatar.tsx`: `radix-ui` Avatar -> `@base-ui/react/avatar`.
  Multi-part primitive, so `Root`/`Image`/`Fallback` keep their names (only
  single-part primitives like `Separator` become callable). Types moved from
  `React.ComponentProps<typeof X.Root>` to `AvatarPrimitive.Root.Props` /
  `.Image.Props` / `.Fallback.Props`. Confirmed against the project's
  original (git HEAD) file: the only differences from stock radix-mira were
  the RSC `"use client"` pragma (dropped, correct for this Vite/`rsc:false`
  project) and icon-library resolution — no user customizations existed to
  preserve.
- `frontend/src/components/editor-pane.tsx:401-419`: consumer sweep —
  `<TooltipTrigger asChild><Avatar>...</Avatar></TooltipTrigger>` ->
  `<TooltipTrigger render={<Avatar>...</Avatar>} />` (per-participant presence
  avatar tooltip). This is a `TooltipTrigger` fix, not an Avatar API change,
  but Avatar was the `render` payload so it's noted here too.

Leftover scan (`grep -n "radix-ui\|@radix-ui" avatar.tsx`): clean.

## Left alone

Nothing else in the project touches Avatar besides `editor-pane.tsx`.

## Behavior changes

None observed. `AvatarFallback`'s delay behavior (Radix `delayMs` -> Base UI
`delay` on `Avatar.Fallback`) is not exercised anywhere in this codebase.

## Verify by hand

- Open a presentation with other participants connected; hover an avatar in
  the participant list and confirm the name tooltip still appears.
- Confirm the avatar fallback initials render before/without an image URL.
