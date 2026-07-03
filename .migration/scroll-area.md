# scroll-area

2026-07-03, golden pair via shadcn CLI (`shadcn add scroll-area --overwrite`,
style flipped to `base-mira`). Pristine wrapper.

## Changed

- `frontend/src/components/ui/scroll-area.tsx`: `radix-ui` ScrollArea ->
  `@base-ui/react/scroll-area`. Part renames only:
  `ScrollAreaScrollbar` -> `Scrollbar`, `ScrollAreaThumb` -> `Thumb`. RSC
  `"use client"` pragma dropped (correct for this Vite/`rsc:false`
  project). By hand: removed the now-unused `import * as React from "react"`
  (`scroll-area.tsx:1` in the CLI's raw output) — the file only used
  `React.ComponentProps<typeof X>` before, which is gone now that both
  functions take the primitive's own `.Props` types directly; leaving the
  import in place would have failed `noUnusedLocals` (`tsc` strict mode).

Leftover scan: clean.

## Left alone

Nothing.

## Behavior changes

None — pure rename, no API or behavior change.

## Verify by hand

Scroll a long file tree or outline panel and confirm the custom scrollbar
thumb still renders and drags correctly in both light and dark mode.
