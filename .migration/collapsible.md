# collapsible

2026-07-03, golden pair via shadcn CLI (`shadcn add collapsible --overwrite`,
style flipped to `base-mira`). Pristine wrapper.

## Changed

- `frontend/src/components/ui/collapsible.tsx`: `radix-ui` Collapsible ->
  `@base-ui/react/collapsible`. `Collapsible.Root` -> callable
  `CollapsiblePrimitive`, `Collapsible.CollapsibleContent` -> `.Panel`. Types
  moved to `CollapsiblePrimitive.Trigger.Props` / `.Panel.Props`.
- `frontend/src/components/file-sidebar.tsx:431-457`: consumer sweep —
  `<CollapsibleTrigger asChild><SidebarMenuButton>...</SidebarMenuButton></CollapsibleTrigger>`
  -> `<CollapsibleTrigger render={<SidebarMenuButton>...</SidebarMenuButton>} />`
  (folder tree row disclosure).

Leftover scan: clean.

## Left alone

`SidebarMenuButton` itself still has its own hand-rolled `asChild` (via
Radix `Slot`) — that's `sidebar.tsx`'s own migration, covered in
[sidebar.md](sidebar.md), not a Collapsible concern.

## Behavior changes

None expected — `Content` -> `Panel` rename is transparent to consumers
(only the wrapper's internals changed).

## Verify by hand

In the file sidebar, expand/collapse a folder with the disclosure triangle;
confirm the chevron rotates and children show/hide, including drag-and-drop
hover state on the folder row.
