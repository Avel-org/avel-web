# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`avel-web` is the frontend of the AVEL Command Center. It is one web app that also builds as the desktop and mobile apps (Tauri targets inside this repo, per `DECISIONS-V2.md`; `src-tauri/` does not exist yet). The backend, the API contract, and **all project docs** live in the sibling repo `avel-server` (locally at `../../avel-server/avel-server`, on GitHub as `Javaris500/avel-server`). This repo keeps no copy of the docs, and it should stay that way.

## Commands

pnpm 10 (pinned in `package.json` via `packageManager`; `corepack enable` picks it up). Node 24 per `.nvmrc`, `engines` allows >=22.

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm routes              # regenerate src/routeTree.gen.ts (tsr generate)
pnpm typecheck           # tsr generate && tsc --noEmit
pnpm lint                # biome check .   (add --write to apply fixes)
pnpm test                # tsr generate && vitest run
pnpm check               # typecheck + lint + test + build + check-tokens, exactly what CI runs
```

Single test: `pnpm exec vitest run tests/nav.test.ts` or `pnpm exec vitest run -t "every route is reachable"`. Run `pnpm routes` first if the route tree is stale, because the plain vitest command does not regenerate it.

## Architecture

- **TanStack Start** (React 19) on Vite 8 with the Nitro plugin, Tailwind v4 via `@tailwindcss/vite`. TanStack Start is a settled decision in avel-server's `DECISIONS-V2.md`. Do not re-propose plain Vite + Router.
- **File-based routing.** `src/routes/*.tsx` uses dot-separated segments (`catalog.agents.tsx` → `/catalog/agents`). `src/routeTree.gen.ts` is generated, gitignored, and excluded from Biome. Never edit it. `src/router.tsx` builds the router from it.
- **`src/routes/__root.tsx`** renders the HTML document, then `ApiProvider` → `ThemeRoot` → `TooltipProvider` → `AppShell` (`src/shell/app-shell.tsx`). Shell rulings are in `design/AVEL-DESIGN.md` §11 (rulings 11-28; later rulings supersede earlier sections).
  - The shell is `h-dvh`. The content sits on an inset, rounded canvas (`--canvas-inset` 8px, `rounded-dialog` 16px), edge to edge below md. Only the canvas (`main#main`) scrolls; the window never does.
  - The sidebar (`sidebar.tsx`) has the collapse control at the top (⌘B), nested groups (Agents, Settings), the active item on the v3 chip surface (ruling 50), and an operator footer showing the signed-in GitHub user (role "Owner" from `operator.ts`). It has no search box. Below md it is a drawer, opened from the top bar via `useNavigationDrawer()`.
  - `AuthGate` (`auth-gate.tsx`) renders the shell only for a signed-in operator. It shows a checking screen while the session is unknown, a sign-in screen (GitHub through Better Auth, `/api/auth/*`, a non-contract route), a not-allowed screen (OAuth `?error=` or a mid-session `NOT_OPERATOR`) and an unreachable screen. The session lives in `src/lib/auth.ts`. A 401 or `NOT_OPERATOR` from any query re-checks it once, in `createAppQueryClient`.
  - `useCommandPalette()` opens the ⌘K command menu: search across missions and clients, go to, create, actions and recent. `DeviceBoundary` swaps construction routes for a notice on phones. The root route's `notFoundComponent` is a designed page.
- **`src/shell/nav.ts` is the single definition of the sidebar.** It has 12 links in 3 groups (Work / Library / Control), per ruling 3 of `design/AVEL-DESIGN.md`, named per ruling 39 (ruling 51 folds Playbooks into Teams). Each link carries a `label`, `to`, and `purpose`. Each link also carries its lucide `icon`.
- **`<Page>`** (`src/shell/page.tsx`) renders the sticky 56px top bar (its border shows once the canvas scrolls), the page's actions, and `GlobalActions` (the ⌘ command menu and the needs-you inbox) on every page. `canvas` makes a page one surface edge to edge (Home's chat). Each route sets `head: pageHead("/x")` for its tab title. The top bar contains:
  - breadcrumbs (nested routes only), the title, and a `subtitle` or the definition, plus an `actions` slot
  - a sidebar page passes `to="/x"`, and its title and definition come from `nav.ts`
  - a page with no sidebar link (a detail page) passes `title` and `definition`
  - pages never print their own heading
- **Route metadata.** Every route declares `staticData: { device: "capture" | "construction" | "approve" }` (types in `src/shell/device.ts`), and `tests/device.test.ts` imports every route module to enforce it. A route with no sidebar link also declares `crumb` (a string, or a function of params) so breadcrumbs can label it. `src/shell/breadcrumbs.tsx` labels each ancestor path from the sidebar, then the route's `crumb`, and drops it otherwise. It never labels a path the router only fuzzily matched.
- **`tests/nav.test.ts` ties the sidebar to the router.** It parses `fullPath:` entries out of the generated `routeTree.gen.ts` and fails if a sidebar link has no route, a route has no sidebar link, or the 12/3 shape changes. Adding a route means adding its `NAV` entry in the same change. Adding a nested route that should not appear in the sidebar (e.g. `/missions/$id`) will fail this test, and the test has to be extended deliberately.
- **Tokens** are defined only in `src/styles/app.css`, in `@theme static` blocks (keep `static`: Tailwind drops unused tokens otherwise). Values come from `design/AVEL-DESIGN.md` (design system v3, ruling 50). Light is the default; `.dark` on the app shell overrides them. The shadcn semantic names a primitive reads (`foreground`, `card`, `popover`, `destructive`) are `@theme inline` aliases pointing at AVEL tokens; unused ones are deleted. `--color-accent` is the brand blue: never use `bg-accent` for a hover, which is `bg-app-raised`. Tailwind's default radii, shadows, text sizes and font families are cleared, so only AVEL's exist: `rounded-xs` 5px (checkbox, kbd), `rounded-sm` 6px (pills, tags), `rounded-tile` 9px, `rounded-control` 10px (buttons, inputs, rows), `rounded-card` 12px (cards, menus, popovers), `rounded-dialog` 16px (dialogs, sheets, the canvas); `shadow-card`, `shadow-btn`, `shadow-popover`, `shadow-dialog`, `shadow-drag`; `h-control-sm|md|lg`, `size-tile-sm|md|lg`; `z-(--z-popover)` and `duration-micro ease-avel`. The primary button's face is `btn-primary-face`, a checked control is `control-on`, a text field's box is `field-surface`. No `dark:` variants: light is the default and dark is a class.
- **Components.** `src/components/ui/` holds shadcn primitives (new-york, Radix, lucide; see `components.json`), restyled once at generation. Variant names are shadcn's, with five named additions: Button's `segment` (a segmented-control segment) and `destructive-confirm`, and Badge's mono `tag`, `count` (a count badge) and `kbd` (a key chip, also exported as `Kbd`). `destructive` is outlined; the one filled danger is `destructive-confirm`, used only as the final confirm inside a dialog that has named the effect (audit D7). Add a component with `pnpm dlx shadcn@latest add <name>`, then fix the import to `@/lib/utils`, because the CLI rewrites it to an npm package called `cn`. Remove its `dark:` classes, its `ring-[3px]` focus glow and any `bg-accent` before committing. Focus is one global 2px `:focus-visible` outline in `app.css`. Domain composites go in `src/components/avel/` and wrap primitives, never fork them.
- **Type and icons.** Inter, with IBM Plex Mono for machine text (ruling 50). Use the type roles (`type-display`, `type-page`, `type-title`, `type-body`, `type-small`, `type-caption`, `type-eyebrow`, `type-metric`, `type-mono`); Tailwind's `text-*` sizes generate nothing. Lucide strokes are 1.75 globally. Other utilities: `no-scrollbar`, `app-scroll`, `focus-inset` (for rings inside clipped containers), `skeleton-pulse`, `landed` and `bg-hatch-warn`.
- **Disabled buttons** take `disabledReason`, shown in a tooltip on a focusable wrapper (ruling 11) and linked by aria-describedby.
- **Three custom checks.** `pnpm lint` runs `scripts/check-raw-colors.mjs`, which fails on any hex value, `rgb()` or `oklch()`, Tailwind palette colour (`bg-red-500`, `text-white`) or arbitrary colour outside `src/styles/`, and `scripts/check-unused-tokens.mjs`, which fails on any token or `@utility` in `app.css` that nothing in `src/` uses. `pnpm check-tokens` runs after the build and fails if any `@theme static` or `.dark` token is missing from the production CSS, or if a non-inline `@theme` block lost `static`. Each was proven by breaking it.
- **Theme and portals.** `ThemeRoot` (`src/lib/theme.tsx`) wraps the app in `.app`, adds `.dark` when the theme is dark (light is the default), and owns a portal container inside that subtree. Any primitive that portals must pass `container={usePortalContainer()}`, or it renders on `<body>` and ignores dark mode. `useTheme()` sets the theme. The theme is toggled from the operator menu and the command menu.
- **Button additions.** `disabledReason="..."` disables the button and shows the reason in a tooltip (see above). `holdToConfirm` with `onConfirm` fires only after a 320ms hold by pointer, Space or Enter; plain clicks do nothing. Use it for deliver and abort.
- **`/dev/primitives`** is a dev-only showcase of every primitive in both themes. It returns 404 in production builds. It is the one entry in `UNLINKED_ROUTES` (`src/shell/nav.ts`), the only routes allowed outside the sidebar, and the nav test requires each entry to be a real `/dev/` route. Check visual changes there in a browser.
- **Design docs** live in `design/`: `AVEL-DESIGN.md`. It is excluded from Biome, so never reformat it.
- **Tests** live only in `tests/` (`*.test.ts` and `*.test.tsx`, node environment, rendered with `renderToString`), never beside the source they test. `tests/render-page.ts` renders a real route with an injected session, and `ApiOverrideProvider` seeds the query cache.
- **Data layer** (`src/lib/api/`). It is a ts-rest client over `avel-server/contract` (linked from `../../avel-server/avel-server`), with TanStack Query through `<ApiProvider>` (mounted in `__root.tsx`).
  - Query keys are defined once, in `keys.ts` (`tests/api-keys-defined-once.test.ts` fails on a `queryKey: [` literal anywhere else).
  - Each mutation hook declares the server tables it writes, and each query key the tables it reads, in `src/lib/api/table-flow.ts`. `tests/api-table-flow.test.ts` runs every write and fails on a read it leaves stale; a deliberate exception goes in its EXEMPT map with a reason. A new hook or key adds its entry in the same change.
  - `call()` turns every failure into an `ApiError`, and `src/lib/error-map.ts` maps contract error codes to copy, exhaustively.
  - Contract types are inferred, never hand-written. A screen needing a shape the contract lacks needs a contract change, not a local interface. Until it exists, that region renders `<Surface notBuilt>`.
  - The one exception is labelled sample data, on the pages a design ruling names (29: mission detail, 32: the Catalog pages). There, a region the contract can't supply yet shows sample values behind the dashed "Sample data" pill (`sample-data.tsx`), which names the route it waits for. Sample types and values live in that page's placeholder module, are never sent anywhere or mixed into a real field, and are deleted when their route lands. Where a contract shape exists, samples use it. Every other page renders `<Surface notBuilt>`.
  - `zod` is pinned to v3 to match avel-server.
- **`/api` is same-origin.** avel-server sends no CORS headers, so the browser calls `/api` on the app's origin and the app forwards it to `AVEL_API_ORIGIN` (default `http://localhost:8787`). In production a Nitro `routeRules` proxy does this. In development `devApiProxy` in `vite.config.ts` does it, because TanStack Start answers before Vite's `server.proxy` or Nitro's rules. On the server, the client uses the absolute origin.
- **`<Surface>`** (`src/components/avel/surface.tsx`) requires loading, empty, error and success, plus `notBuilt`. Use it for every data region; pass `freshness={{}}` so the region says how old its data is (`ReadAge`, never "Live"). A page's primary regions are `DataPanel`s with a `PanelFooter`; the shared v3 patterns (panel, read age, lifecycle, readiness checklist, actor mark, dispatch evidence, search field, row link, reason, columns menu, confirm dialog, canvas, dashboard) are listed in `design/AVEL-DESIGN.md` section 10. Use them; don't redraw them.

## Conventions

- Biome formats with **tabs** and organizes imports. TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, and `verbatimModuleSyntax`. Use `import type` for type-only imports.
- Comments explain *why*, as in `sidebar.tsx` (the brand block is not a link, because two `aria-current="page"` elements would be announced on Home). Accessibility details like the skip link and `:focus-visible` are deliberate. Keep them.
- Below md (48rem) the sidebar becomes a drawer behind a menu button, and construction routes show the device-boundary notice.
- Per-viewer preferences (theme, sidebar rail) go through `useStoredState` (`src/lib/stored.ts`), which survives blocked storage.

## The docs (in avel-server)

`avel-server/CLAUDE.md` holds the project-wide agent rules. Read it before non-trivial work. The ones that matter most here:

1. **Verify before you assert.** Read the code, not the doc about it. If a tool fails, say so. Do not read an error as a result.
2. **Extend, never redefine.** Tokens, entity names, and conventions are load-bearing. Add alongside them. If you change a shared definition, say so in the first sentence of your response.
3. **Report before fixing.** If a doc disagrees with the code, or two docs disagree, write it down and stop. The code wins, and the disagreement is a finding.
4. **Do the arithmetic.** Count the items before relying on any stated count.
5. **Delete the references, not just the thing.**
6. **Prove a check by watching it fail.** Break what a test guards and watch it go red before trusting it.

Also from those docs: **a README never states build status.** Status lives only in `avel-server/docs/STATE.md`. Writing is plain and declarative, with no em-dash asides and no marketing adjectives. Use mono for machine output (hashes, paths, counts) and sans for prose.

Which doc to read for frontend work (`avel-server/START-HERE.md` has the full map):

| Task | Read |
|---|---|
| How avel-web is built: layout, data layer, checks, "a screen is done when" | `docs/BUILDING-AVEL-WEB.md` (read first) |
| Design system: palette, type, shell, components, rulings | `design/AVEL-DESIGN.md` in **this** repo |
| Building the frontend | `docs/DAY-ONE-FRONTEND.md` → `docs/ROUTES.md` → `docs/DATA-CONTRACTS-V2.md` |
| What each module does | `docs/COMMAND-CENTER.md` → `docs/STATE.md` |
| Design / tokens | `docs/patches/globals-patch.css` → `docs/DESIGN-PLUGINS.md` |
| shadcn components | `docs/SHADCN-PRINCIPLES.md` |
| Pre-flight / export screen | `docs/BLAST-RADIUS.md` |
| Proposing any change | `docs/DECISIONS-V2.md` first. Several ideas there were already rejected. |

Frontend rules from `ROUTES.md` and `DAY-ONE-FRONTEND.md` that shape new code:
- Every data screen has four states (loading with a content-shaped skeleton, empty, error mapped by `error.code`, success), enforced by a `<Surface>` generic. Never parse error `message`. Codes are the contract.
- Device class is per route through `staticData: { device: 'capture' | 'construction' | 'approve' }`. A phone hitting a construction route gets a designed "open on desktop" screen, not a redirect. Initiating an irreversible export from a phone is never allowed.
- Every component gets its `data-testid` in the same commit.
- Never put a literal hex in a component. A missing colour is a token change.
- `MOBILE-PWA.md` does not exist yet, and it blocks all offline/mobile capture work.
