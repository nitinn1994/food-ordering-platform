# Test Plan — McDelivery page-by-page parity

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC1 tokens | `globals.test.ts` token presence plus WCAG ratio pairs; grep component modules for brand hex values | automated |
| AC2 desktop header | `SiteNav.test.tsx`: order of controls, search link, badge shows the backend count and is hidden while loading | automated |
| AC3 breakpoint | DevTools at 1199 / 1200 / 1440 and 390: layout switch and `scrollWidth <= innerWidth` on every route | manual (scripted) |
| AC4 mobile shell | `MobileTabBar.test.tsx` (`aria-current`), `BackHeader.test.tsx`; focus-obscuring check at 375×667 and 390×844 | automated + manual |
| AC5 home | `HeroBanner.test.tsx` (thumbnail buttons, arrow keys, `aria-pressed`), `CategoryBento.test.tsx`; screenshots | automated + manual |
| AC6 routes | page tests for `/menu/[categoryId]` and `/tag/[feature]` (valid → content, invalid → `notFound`); sold-out card test | automated |
| AC7 card and overlay | `MenuItemCard.test.tsx`, `Overlay.test.tsx` (Escape, focus return), toast only after a resolved add | automated |
| AC8 search | `SearchView.test.tsx` (filter as you type, no results, recent searches), `recentSearches.test.ts` (cap 5, clear, storage throws). No `searchMenu.ts`: the menu's existing `filterMenu` (name and description, case-insensitive) is reused, and is already tested | automated |
| AC9 offers | offers page test: search filter; no cart call made (mocked client asserts zero calls) | automated |
| AC10 stores | stores page test: list and empty state; `navigator.geolocation` never touched | automated |
| AC11 static | template test; `footerLinks.test.ts` checks every href is a known route | automated |
| AC12 login placeholder | the input is disabled, the submit is disabled, no form submit handler fires | automated |
| AC13 cart page | `TotalCharges.test.tsx` shows only backend amounts; empty state; action-bar link | automated |
| AC14 no regressions | the full existing web suite; changed tests listed with the reason | automated |
| AC15 a11y | one-`h1` test per page; keyboard walk; Lighthouse a11y on home, menu, cart | automated + manual |
| AC16 Docker | dev stack `up -d --wait`, `ps`, curl every route (status 200 plus `h1` grep, and 404 for bad ids), screenshots → `parity-checklist.md` | manual (scripted) |

## New or changed tests

Co-located beside each new or changed component and library module, as named
above. Tests changed only because of markup are listed in the implementation
report with the reason.

## Validation commands

From `apps/web/package.json` and the root `package.json` / `turbo.json`.

| Check  | Command | Expected |
| ------ | ------- | -------- |
| format | — | NOT_CONFIGURED (no formatter script) |
| lint   | `pnpm --filter web lint` | PASS |
| types  | `pnpm --filter web typecheck` | PASS |
| test   | `pnpm --filter web test` | PASS |
| build  | `pnpm --filter web build` (dev stack's web stopped first; memory note) | PASS |
| full   | `pnpm turbo run typecheck lint test` before `/review` | PASS |

Docker commands (`docker compose -f infrastructure/docker/compose.dev.yaml
--env-file infrastructure/docker/env/.env.dev up -d --wait`, `ps`, `down`)
are Docker's own CLI on the repository's compose file, and are reported as
manual checks.

## Manual checks

1. Dev stack up. All services are healthy in `ps`.
2. For each in-scope route: `curl -s http://127.0.0.1:3000<route>` returns
   200 and the body contains the route's `h1` text. `/menu/unknown` and
   `/tag/unknown` return 404.
3. Screenshots at 1440×900 and 390×844 per route, compared with
   `scratchpad/mcd-ref/*`, with the results recorded in `parity-checklist.md`.
4. Keyboard only: home → add an item → cart → checkout review, at both sizes.
5. Lighthouse accessibility on `/`, `/menu/<id>` and `/cart`.
6. Voice/chat: "show me burgers" on `/menu/<other>` selects in place, and
   "add <item>" shows the toast after the cart refreshes.

## Not covered

- **Pixel-exact comparison.** The reference uses proprietary assets and font,
  so the comparison is structural and token-level by eye, not image diffing.
- **Reference pages behind login.** Out of scope.
- **Real browsers other than Chrome.** Only Chrome DevTools is available.
