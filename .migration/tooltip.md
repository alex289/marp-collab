# tooltip

2026-07-03, golden pair via shadcn CLI (`shadcn add tooltip --overwrite`,
style flipped to `base-mira`). Pristine wrapper; positioner-model restructure.

## Changed

- `frontend/src/components/ui/tooltip.tsx`: `radix-ui` Tooltip ->
  `@base-ui/react/tooltip`. `Provider`'s `delayDuration` -> `delay` (default
  `0`, unchanged). `Content` -> `Portal > Positioner > Popup`; `side`/
  `sideOffset`/`align`/`alignOffset` moved to `Positioner`, forwarded
  explicitly from `TooltipContent` (verified, not leaking via `...props`).
  `Arrow` kept, re-styled with explicit per-side positioning classes.
  Re-fetched a second time as a dependency of `sidebar`; the CLI included a
  stray `"use client"` pragma on that second pass (inconsistent with every
  other component, which correctly omitted it for this `rsc:false` Vite
  project) — stripped by hand.
- Consumer sweep, `asChild` -> `render` (universal pattern, `TooltipTrigger`
  wraps its child element via `render` instead of cloning via `asChild`):
  - `frontend/src/components/editor-pane.tsx:342-374`: two toolbar buttons
    (wrap toggle, focus mode toggle).
  - `frontend/src/components/editor-pane.tsx:403-419`: per-participant
    presence avatar tooltip.
  - `frontend/src/components/file-sidebar.tsx:203-218`: sidebar icon-button
    tooltip (native `<button>` render target, not the `Button` wrapper).
  - `frontend/src/components/mode-toggle.tsx:19-33`: nested inside
    `DropdownMenuTrigger`'s own `render` (see [dropdown-menu.md](dropdown-menu.md)).
  - `frontend/src/components/ui/sidebar.tsx:509`: `SidebarMenuButton`'s
    internal tooltip-on-collapse (`<TooltipTrigger asChild>{button}</TooltipTrigger>`
    -> `<TooltipTrigger render={button} />`).

Leftover scan: clean.

## Left alone

Nothing else uses Tooltip.

## Behavior changes

- **FLAG**: Trigger default open delay is documented as `600` in Base UI vs
  Radix's `700` default — negligible, and this project's `TooltipProvider`
  already overrides to `delay={0}` everywhere it's used, so not observable
  here.
- `disableHoverableContent` (not used anywhere in this codebase) has no
  direct Base UI equivalent at the Provider level; only per-Root
  `disableHoverablePopup`. Flagging for awareness, not applicable today.

## Verify by hand

Hover every tooltip trigger in the app (editor toolbar icons, participant
avatars, sidebar icon buttons, mode toggle, collapsed sidebar menu items)
and confirm they appear instantly (delay is set to 0 everywhere) and
position correctly (no clipping/misalignment against triggers near screen
edges).
