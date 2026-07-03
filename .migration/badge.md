# badge

2026-07-03, golden pair via shadcn CLI (`shadcn add badge --overwrite`, style
flipped to `base-mira`). Pristine wrapper.

## Changed

- `frontend/src/components/ui/badge.tsx`: `Slot`/`asChild` idiom (from
  `radix-ui`) -> `useRender` + `mergeProps` from `@base-ui/react/use-render`
  and `@base-ui/react/merge-props` (the non-button polymorphic pattern —
  Badge is not a real button, so it does NOT use the `@base-ui/react/button`
  primitive the way `button.tsx` does). Props type
  `React.ComponentProps<"span"> & { asChild?: boolean }` ->
  `useRender.ComponentProps<"span">`. `asChild` prop dropped in favor of
  `render`.

Leftover scan: clean.

## Left alone

Nothing — grepped the whole app for `asChild` usage on `Badge`; none found
(all current call sites render Badge as a plain `<span>`, no polymorphism in
use).

## Behavior changes

None expected — functionally equivalent polymorphism, just a different API
surface (`render` instead of `asChild`), and it isn't exercised anywhere
today.

## Verify by hand

Visually confirm badge variants still render (status pill, "Read-only",
line/word/char/slide counters in the editor stats bar).
