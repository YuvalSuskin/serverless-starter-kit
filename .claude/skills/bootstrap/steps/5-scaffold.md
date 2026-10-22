# Step 5: Scaffold

The component layer the first features are built from: shadcn's style and
component library, the base components the first specs need, the app's
language and direction, and the icons. Read `frontend/CLAUDE.md` first
(_Rules, and why_: the shadcn MCP, the `shadcn` skill, the registry, tokens
only).

**Needs:** step 4 done (the tokens the components are restyled to) and the
first specs from step 2 (what components they need).

**Fills:** no `fills.json` token. It writes `frontend/components.json`,
`frontend/src/lib/locale.ts` and `frontend/src/ui/`. The marked files it may
touch (`frontend/e2e/budgets.ts`, `frontend/e2e/skeleton.spec.ts`) keep their
`Skeleton:` marker until step 6 (`SKILL.md`, _The skeleton marker_).

## Asks

One question per message, in this order.

1. **The component library:** Radix (`radix-ui`, what the template's
   components use today) or Base UI. Recommend Radix unless the owner has a
   reason: the template's own components and the `@000h-cojeev` registry are
   built on it, and the `migrate-radix-to-base` skill exists for a later move.
2. **The shadcn style** (`new-york` today, or another style shadcn offers),
   shown with the same two components in each. A preset from shadcn's
   gallery may be used for the style and the library only, **never for its
   colours**: the colours are step 4's tokens.
3. **The owner's registry:** `frontend/CLAUDE.md` says to reach for
   `@000h-cojeev` first. Offer to keep it as the default; the owner may name
   another registry, or none.
4. **The icon and logo:** whether the owner has a logo; if not, a lettermark
   in the accent from step 4 serves until they do.

## Writes

- **`frontend/components.json`:** the style, the library, `baseColor`
  left neutral (the tokens decide the colours), and `registries` as question 3
  decided. Run shadcn as `npx shadcn@4.21.5` from `frontend/`, never
  `@latest`.
- **The base components the first specs need.** A spec rarely names
  components; derive them from what each first spec's screens ask of the
  person (§4's affordances and their Kind: something typed is an Input with a Label, a pick
  from a few is a radio group or select, an action is the Button that
  exists). Only components a first spec uses: an unused one fails knip.
  Look for each in the owner's registry first, then shadcn's (the shadcn
  MCP, or `npx shadcn@4.21.5 search` and `view` from `frontend/`; the MCP
  reads the `components.json` of the session's own folder, so from another
  checkout use the CLI). **Never `shadcn add` a registry item as it is:** a
  registry's item can pull dozens of files and its own theme, and overwrite
  `src/ui/` files and `src/lib/utils.ts`. `view` the item and adapt it by
  hand into `frontend/src/ui/`, keeping its API and dropping its theme, as
  `src/ui/badge.tsx`'s header shows; if you want `add` for a stock shadcn
  component, run it with `--dry-run` (and `--diff` for a file that exists)
  first and add only when it writes the one file you expect. Each is
  restyled to the tokens (no `rounded-md`, no `text-sm`), has a story, and
  passes the audit checklist (the MCP's `get_audit_checklist`; it is a fixed
  list, so read it once and check each component against it).
- **The language and direction:** `LOCALE` and `DIRECTION` in
  `frontend/src/lib/locale.ts` (the only place they are written, D6), from
  step 1, as a BCP 47 tag with the market's region where it matters
  (`en-GB`, `he`). The e2e checks of `<html lang dir>`
  (`frontend/e2e/skeleton.spec.ts`) read them from that module, so they
  follow; `frontend/src/lib/locale.test.ts` asserts English and left to
  right, so for another language rewrite it to that language's plural forms,
  month name and direction. For right to left, check the stories and the
  phone e2e in that direction (`parameters: { direction: "rtl" }`,
  `frontend/CLAUDE.md`).
- **The icons:** `icon.svg` (or `.png`) and `apple-icon.png` in
  `frontend/src/app/`, from the logo or the lettermark; a logo file, if any, in
  `design/` with a line in `design/CLAUDE.md` saying what it is.
- **The budgets, re-measured** if the components change what a page loads
  (`frontend/e2e/budgets.ts`, as step 4 says).

## Records

- BS rows: the library and why; the style; the registry (kept, changed or
  none); the locale and direction as written; the icon's source (logo or
  stand-in).

## Done when

- `components.json` names the chosen style and registries, and
  `frontend/src/lib/locale.ts` holds the project's locale and direction.
- Every component the first specs name exists in `frontend/src/ui/` with a
  story, on the tokens.
- `pnpm -C frontend check` and `pnpm e2e` pass.
