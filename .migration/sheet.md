# sheet

2026-07-03, golden pair via shadcn CLI (`shadcn add sheet --overwrite`,
style flipped to `base-mira`). Pristine wrapper. Confirmed against the
project's original file: the only differences from stock radix-mira were
the RSC pragma, icon-library resolution, and menu-preset class tokens not
enabled for this project's `components.json` — no user customizations lost.

## Changed

- `frontend/src/components/ui/sheet.tsx`: built on `@base-ui/react/dialog`
  (Base UI has no separate "sheet" primitive — a sheet is a styled Dialog,
  same as Radix). `Overlay` -> `Backdrop`, `Content` -> `Popup` (no
  Positioner — sheets, like dialogs, are not anchored/positioned popups).
  Slide-in/out animations rewritten from Radix's `animate-in`/`animate-out`
  keyframe classes to Base UI's `data-starting-style`/`data-ending-style`
  transition hooks, with explicit per-side `translate` values
  (`sheet.tsx:47`). `Close` kept, its `asChild` internally became `render`
  wrapping the `Button`.

Leftover scan: clean.

## Left alone

No consumers currently import `Sheet*` directly — it's only used internally
by `sidebar.tsx` for the mobile sidebar drawer (see [sidebar.md](sidebar.md)),
which doesn't use `SheetTrigger`/`SheetClose`, so there was no consumer
`asChild` sweep needed for this component specifically.

## Behavior changes

None expected — the animation rewrite (keyframes -> transitions) is a Base
UI implementation detail; the visual slide effect is designed to look the
same.

## Verify by hand

On a narrow/mobile viewport, open the file sidebar (which renders as a
`Sheet` on mobile) and confirm it slides in/out from the correct side
without a flash or jump, and that clicking the backdrop or close affordance
dismisses it.
