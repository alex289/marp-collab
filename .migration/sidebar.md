# sidebar

2026-07-03, golden pair via shadcn CLI (`shadcn add sidebar --overwrite`,
style flipped to `base-mira`). Largest wrapper in the project (~700 lines).
Mostly pristine, with one real customization caught and restored by diffing
the pre-overwrite file against stock radix-mira.

## Changed

- `frontend/src/components/ui/sidebar.tsx`: five internal `asChild`/`Slot`
  polymorphic components (`SidebarGroupLabel`, `SidebarGroupAction`,
  `SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuSubButton`) migrated
  to `useRender` + `mergeProps` (non-button polymorphic pattern — these are
  composite/variant-driven components, not the plain `Button` primitive).
  The sidebar's own `TooltipTrigger` usage (`sidebar.tsx:509`,
  `SidebarMenuButton`'s collapsed-state tooltip) fixed: `<TooltipTrigger
  asChild>{button}</TooltipTrigger>` -> `<TooltipTrigger render={button} />`.
  Root `radix-ui` `Slot` import removed entirely.
  - **Customization preserved**: the sidebar-toggle button (`SidebarTrigger`,
    `sidebar.tsx:245-265`) and the drag-to-resize rail (`SidebarRail`,
    `sidebar.tsx:269-290`) both had `title`/`aria-label="Toggle Sidebar
    (Ctrl/Cmd+B)"` — a keyboard-shortcut hint absent from the stock
    registry template (which just says "Toggle Sidebar"). Confirmed by
    diffing the pre-overwrite file against fetched radix-mira stock: this
    was the ONLY non-mechanical difference in the entire file (everything
    else was RSC pragma, icon resolution, and Tailwind arbitrary-value
    syntax modernization — e.g. `-left-(--sidebar-width)` ->
    `left-[calc(var(--sidebar-width)*-1)]`, functionally identical). Restored
    the `(Ctrl/Cmd+B)` hint by hand on both elements after the
    `--overwrite` pass dropped it.
  - The CLI's `--overwrite` also re-fetched three of sidebar's own
    dependencies as a side effect: `button.tsx`, `separator.tsx`,
    `tooltip.tsx` (already migrated — re-fetches were byte-identical
    post-format to the earlier passes) and, notably, `input.tsx` and
    `skeleton.tsx`, which were NOT radix-based before this migration at all.
- `frontend/src/components/ui/input.tsx`: picked up `@base-ui/react/input`
  (Base UI's `Input` primitive) in place of a plain `<input>`, as part of
  this project's `base-mira` style preset — not a radix->base swap (there
  was no radix dependency here to begin with), but an expected consequence
  of the whole-project style flip. Purely additive; same className/props
  surface.
- `frontend/src/components/ui/skeleton.tsx`: formatting-only re-fetch (spaces
  vs. tabs), no content change.
- `frontend/src/hooks/use-mobile.ts`: formatting-only re-fetch, no content
  change.

Leftover scan (`grep -n "radix-ui\|@radix-ui\|asChild\|Slot" sidebar.tsx`):
clean.

## Left alone

Nothing else — this was the last component on Radix in the project.

## Behavior changes

None expected beyond what's already flagged for `Tooltip`/`Button` in their
own reports (this file is a consumer of both).

## Verify by hand

- Toggle the sidebar with `Ctrl/Cmd+B` and via the trigger button; hover the
  trigger and the drag rail and confirm both tooltips/`title` attrs still
  say "Toggle Sidebar (Ctrl/Cmd+B)".
- Collapse the sidebar to icon-only mode and hover a menu item — confirm the
  flyout tooltip appears.
- On mobile width, open the sidebar as a `Sheet` (see [sheet.md](sheet.md))
  and confirm it still slides in correctly.
- Drag the resize rail on the sidebar's edge and confirm cursor and resize
  behavior are unchanged.
- Confirm the settings-panel theme `<Select>` and project-name `<Input>`
  inside the sidebar still work (both now render through Base UI
  primitives).
