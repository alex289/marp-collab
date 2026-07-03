# project — Radix UI -> Base UI (whole project)

2026-07-03. Whole-project migration, golden pair via shadcn CLI throughout
(`components.json` style `radix-mira` -> `base-mira`, flipped up front per
whole-project mode). All 14 Radix-backed `components/ui` wrappers migrated
in dependency order; two customizations caught and restored via three-way
merge; app code swept for `asChild` and prop-signature breaks.

## Migration order

1. **Tier 0** (no ui-to-ui deps): avatar, badge, button, collapsible,
   dropdown-menu, label, scroll-area, select, separator, tooltip — all
   pristine, straight CLI `--overwrite`. See individual reports.
2. **Tier 1** (depend on button): button-group, dialog, sheet.
   `button-group` was the one CUSTOMIZED wrapper in this tier (restored
   `rounded-lg`/`text-sm` design tokens via `git merge-file` three-way
   merge). `dialog`/`sheet` were pristine.
3. **Tier 2** (depends on button, input, separator, sheet, skeleton,
   tooltip): sidebar. Pristine except for a `(Ctrl/Cmd+B)` keyboard-shortcut
   hint on two elements, restored by hand after diffing pre-overwrite
   against stock radix-mira.

## Dependency swap

- Added `@base-ui/react@^1.6.0` to `frontend/package.json` at the start.
- Removed `radix-ui@^1.6.0` from `frontend/package.json` after the last
  wrapper (`sidebar`) was finalized and the leftover sweep came back clean.
- `frontend/components.json`: `"style": "radix-mira"` -> `"style": "base-mira"`.

## App-code sweep (consumer-props.md)

Swept every file outside `components/ui` for the universal `asChild` ->
`render` change and the per-component prop-signature changes:

- **`asChild` -> `render`** (18 call sites across 11 consumer files, plus 1
  inside `sidebar.tsx` itself): `editor-pane.tsx`
  (3), `file-sidebar.tsx` (2), `mode-toggle.tsx` (2, nested
  Tooltip-in-DropdownMenu), all 8 `dialog/*.tsx` consumers (11 call sites
  across `DialogTrigger`/`DialogClose`), and `sidebar.tsx`'s own internal
  Tooltip usage. One prop-type narrowing was needed alongside this:
  `DeleteProjectDialog`'s `trigger` prop went from `ReactNode` to
  `ReactElement` (`dialog/delete-project.tsx:2,21`) since Base UI's `render`
  requires an element, not any node — verified both call sites already only
  ever passed a `Button` element or omitted the prop.
- **Select `onValueChange` widening** (`(value: string) => void` ->
  `(value: string | null, eventDetails) => void`): fixed in
  `dialog/manage-project-collaborator.tsx:211-215` (access-level select) and
  `file-sidebar.tsx:811-815` (theme select), both by guarding/defaulting at
  the call site rather than widening the parent state/prop types.
- Checked and found **not applicable** to this codebase: Accordion, Tabs,
  Checkbox, Slider, ToggleGroup, Menubar, ContextMenu, NavigationMenu,
  Popover, HoverCard, DirectionProvider (none of these components exist in
  `components/ui` or are used anywhere) and `Avatar.Image`'s `delayMs`,
  `ScrollArea`'s `type` prop, `Separator`'s `decorative` prop (none of these
  props are set anywhere in the app).

## Left alone (never touched, per hard rules)

- `cmdk` (no `command.tsx` wrapper exists in this project — not applicable).
- `sonner.tsx` — toast library, third-party, not Radix.
- No `vaul`/drawer, `input-otp`, `react-day-picker`/calendar, or `recharts`/
  chart wrappers exist in this project either.
- `card.tsx`, `field.tsx`, `file-drop-zone.tsx`, `kbd.tsx`, `table.tsx` —
  never depended on Radix; untouched.

## Final verification (vs. baseline)

- `pnpm typecheck` (actually `tsc --noEmit -p frontend/tsconfig.app.json` —
  see note below): clean, 0 errors.
- `pnpm lint` (`oxlint --type-aware --deny-warnings`): clean, 0
  warnings/errors.
- `pnpm format:check`: clean except one pre-existing, untouched issue in
  `.claude/settings.local.json` (confirmed via `git diff` — not modified by
  this migration).
- `pnpm build` (full monorepo, all 4 workspaces): succeeds.
- `backend/pnpm test`: 75/75 passing, unaffected (backend has no UI
  dependency on this change).

**Pre-existing issue found and worked around, not fixed (out of scope):**
`frontend/package.json`'s own `"typecheck": "tsc --noEmit"` script is a
no-op — `frontend/tsconfig.json` is a solution-style file with `"files": []`
and only `references`, so a bare `tsc --noEmit` run from that directory
type-checks nothing and always reports 0 errors regardless of real errors in
the code. All typecheck verification in this migration used
`tsc --noEmit -p frontend/tsconfig.app.json` directly instead, which does
check the actual `src/` files. Flagging this for the user to fix separately
(e.g. `tsc -b --noEmit` or pointing the script at `tsconfig.app.json`), since
it silently masked type errors for anyone running `pnpm typecheck` in
`frontend/` before this migration too.

**Not independently verified:** live browser QA (login is gated behind a
real OAuth provider this agent can't authenticate through). Each
component's own report has a "Verify by hand" checklist — recommend running
through those after `pnpm dev`.

## Derived status

`grep -rl "radix-ui\|@radix-ui" frontend/src/components/ui/` and
`frontend/src/` (whole app): **0 files** — no wrappers remain on Radix.
