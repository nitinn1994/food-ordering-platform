# Review Report — mcdelivery-parity

**Reviewed:** `requirements.md`, `plan.md`, `test-plan.md` and
`parity-checklist.md`, then the uncommitted working tree (`git status`,
`git diff` and the new files under `apps/web/src`). The review had two parts.
An independent read-only `implementation-reviewer` agent read the plan and the
diff, focusing on the route-category handoff, the dialog lifecycle, the
confirmed-add extraction, the `(home)` move, the test shim, and every changed
pre-existing assertion. My own pass covered scope, then reproduced the agent's
findings in Chrome on the Docker dev stack.
**Path:** Standard
**Date:** 2026-10-05

## Verdict

**Not ready to merge** (at review time — see "Fixes applied" below: findings
1–4 are now fixed). One HIGH defect must be fixed first: the category
chosen on a `/menu/[categoryId]` page leaks into the home page. The tooling
side is clean: the full check set passes (`TURBO_FORCE=true pnpm turbo run
typecheck lint test build`, 24/24 tasks, 1446 tests), and every changed file
belongs to a plan phase.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | HIGH | `apps/web/src/lib/menu/routeCategory.tsx:28-35` | **The route's category leaks into the home page.** `RouteCategoryProvider` writes the route's id into the root-level `uiStore`, and nothing clears it on leaving the route. **Reproduced:** at 390×844, open `/menu/burgers-wraps` and tap the Home tab. `/` then shows only "Burgers & Wraps", with that rail item pressed. The same happens via the brand link on desktop. The home page is meant to show the whole menu, and the AC6 tests never unmount and remount the provider. | Clear the selection when the provider unmounts: an effect cleanup calling `selectCategory(null)`. Add a test that mounts, unmounts and remounts under one shared `UiProvider`. |
| 2 | MEDIUM | `apps/web/src/components/menu/ItemDetailPanel.tsx:22-30`, `lib/state/uiStore.tsx` | **An open item detail follows the customer to the next page.** `detailItemId` lives in the root store, and unmounting the panel doesn't clear it. **Reproduced:** open an item's detail on `/`, navigate to `/search`, and the same item's modal opens on `/search`. My check navigated by a script click. A real user gets there with the browser's Back or the Android back gesture while the modal is open. The reviewer rated this LOW; I raised it to MEDIUM because that path is easy to hit. | Clear `detailItemId` when the pathname changes, or when the last `ItemDetailPanel` unmounts. Add a test. |
| 3 | MEDIUM | `apps/web/src/components/menu/ItemDetailPanel.tsx:31-41` | **Any confirmed add closes the open detail,** whatever started it (Phase 3 decision). An add started from a card just before opening another item's detail, or a voice or chat "add X" for an unrelated item, closes a modal the customer just opened. **Not reproduced in a browser.** Reasoned from the code: the effect ignores `added.itemId`. | Close only when the add came from this detail: its own Add button, or the nudge inside it. For example, have the panel remember that it started an add, and close on that confirmation only. |
| 4 | MEDIUM | `apps/web/src/components/menu/MenuList.test.tsx`; `MenuList.tsx` (`filterByFeature`); `lib/state/uiStore.tsx` (`featureFilter`) | **Coverage was removed along with the chips, but the logic stayed.** Two featured-chip tests were removed when the chips became links in `MenuBand`: "filters by the one pressed" and "combined filters leave nothing". `MenuBand.test.tsx` covers the links. But `MenuList` still applies `featureFilter`, and nothing in non-test code sets it any more. The result is dead state with no test. This was reported as follow-up work in Phase 3. | Either remove the feature filter from `uiStore` and `MenuList` (a small, separate change), or restore a test that drives it directly. Recommendation: remove it. |
| 5 | LOW | `apps/web/src/components/ui/Overlay.tsx` (`onCancel`) | **Possible desync with Chrome's close-watcher.** The overlay calls `preventDefault()` on `cancel`. Chrome can close a dialog natively on a repeated Escape with no user activation in between, and there is no `close` handler to bring React back in step. **Unverified:** in the browser, a single Escape behaved correctly. | Also handle the native `close` event and call `onClose()` when it fires. |
| 6 | LOW | `apps/web/src/components/cart/CartList.module.css` (`body:has(.actionBar)`) | **The reserved space can be too short.** The cart action bar has a `min-height` and wraps. With the "unavailable items" message it can be taller than the 64px the page keeps free, so the last control could sit under it. Not reproduced: the demo cart had no unavailable lines. | Reserve space based on the bar's real height, or keep the bar to one line (shorter message, or move the message into the page). |
| 7 | LOW | `apps/web/src/components/cart/CartList.module.css` (`.actionBar` box-shadow) | **A brand-tinted colour literal** (`rgb(168 124 79 / 20%)`) sits in a component module rather than a token. The AC1 grep checks hex values only, so it isn't caught. | Add a `--shadow-sticky-bar` token. |
| 8 | LOW | `apps/web/src/app/cart` | **Cumulative Layout Shift is 0.106** on `/cart` in Lighthouse desktop, against a 0.1 threshold. The page is a static shell and the cart arrives in the browser. Accessibility, best practices and SEO all score 100. | Reserve the layout's height while the cart loads, with a skeleton of the two columns and the bar. |
| 9 | LOW | `apps/web/src/components/ui/Overlay.module.css` | **No scroll lock** behind the modal. The page is inert but still scrolls by wheel or touch under the blurred backdrop. Cosmetic. | `:global(html):has(dialog[open])` → `overflow: hidden`. |
| 10 | LOW | `apps/web/src/components/layout/SiteFooter.tsx` | **The copyright year comes from `new Date()`,** so it's frozen at build time on prerendered routes such as `/cart`. Already listed in Phase 1. | Use a fixed year, or render the year only on dynamic routes. |
| 11 | NOTE | `apps/web/vitest.setup.ts` | **The `<dialog>` shim makes jsdom pass checks it can't really perform** (top layer, inertness, focus trap). It says so in its comment and only applies when jsdom lacks the feature. The focus-trap part of AC7 rests on the browser checks in `parity-checklist.md` §3, not on unit tests. | None. Keep the browser check whenever the overlay changes. |
| 12 | NOTE | `plan.md` "Affected files" | **The file list drifted from the plan.** The plan's `public/brand/*` slide art was not created: the hero uses CSS gradients and existing `public/menu/*.svg`. `Toast.*` became `AddedToast.*`. Several files not in the table were added: `MenuLayout`, `FeatureIcon`, `scrollToMenu`, `routeCategory`, `useConfirmedAdd`, `app/menu/page.tsx`, `StaticContent`, `shell.module.css`, `not-found.module.css` and `app/(home)/*` (the route-group move). The phase reports mention them one at a time but never in one list. | List them in `pr-description.md`. |
| 13 | NOTE | `apps/web/src/components/menu/MenuItemCard.tsx` (existing in `HEAD`) | **Two issues that were already in `HEAD`:**<br>- A keyboard add drops focus to the page body, because the Add button disables while the add is in flight.<br>- The card's detail button's accessible name ("View details for X") doesn't contain its visible text, which Lighthouse flags. | Separate follow-up. |
| 14 | NOTE | `apps/ai-service/ai_service/llm/simulated.py:132` (existing in `HEAD`) | **The simulated model sends stale category ids:** the test menu's `desserts`, `starters` and `mains`. On the Docker demo menu, "show me the desserts" selects an empty category. | Separate follow-up: resolve category names against the menu. |

The reviewer found no BLOCKER, and neither did I.

**Clean areas:**
- **Security.** Recent searches are parsed defensively (try/catch, shape check, a cap on count and length). Every query is rendered as escaped text. Route params are matched against the menu or the contract's feature list before use. The login placeholder collects nothing.
- **Behaviour after the `useConfirmedAdd` extraction.** The effect, its dependencies and the sequence logic moved verbatim, so `NudgeToast` behaves as before.
- **Changed pre-existing assertions.** Each one is justified by a markup change except finding 4.

## Acceptance criteria

| AC | Status | Evidence / gap |
| -- | ------ | -------------- |
| AC1 tokens | Met (one gap) | `globals.test.ts` checks the new tokens and contrast pairs. One literal remains (finding 7). |
| AC2 header | Met | The `SiteNav` order test. Search and Account are links, and the cart badge shows the backend count. |
| AC3 breakpoint | Met | CSS media queries only. Browser checks at 375, 390, 1199, 1200, 1280 and 1440 found no overflow. |
| AC4 mobile shell | Met | `MobileTabBar` and `BackHeader` tests. The focus check passed on every page (checklist §3). Caveat: finding 6. |
| AC5 home | Met | Hero carousel tests, bento and Quick Picks tests. Browser screenshots. |
| AC6 category / tag routes | **Not met** | The routes, the 404s and the sold-out state are correct, but the selection leaks back to `/` (finding 1). |
| AC7 card and detail | Met, with defects | Dialog, Escape and focus return were checked in unit tests and the browser. The toast appears only after a confirmed add. Findings 2 and 3 are lifecycle defects. |
| AC8 search | Met | `SearchView` and `recentSearches` tests. |
| AC9 offers | Met | Display only. A test asserts that no cart request is made. |
| AC10 stores | Met | Demo label, empty state, and a test that geolocation is never touched. |
| AC11 static pages | Met | One-h1 template tests. Every footer link resolves to an existing route (filesystem test). FAQ uses `<details>`. |
| AC12 login placeholder | Met | Disabled field and button, no form, a clear notice. |
| AC13 cart page | Met | `TotalCharges` shows only backend amounts. The note is labelled as not sent. Caveat: finding 6. |
| AC14 no regressions | Met (one gap) | The full suite passes, and each changed test is justified. Caveat: finding 4. |
| AC15 accessibility | Met | Lighthouse accessibility 100 on home, menu and cart. The keyboard walk to checkout review works. One h1 per page. |
| AC16 Docker verification | Met | Stack healthy. The route probe passes 20/20. `parity-checklist.md`: 0 FAIL after fixes. |

## Scope check

| Changed file(s) | Serves plan phase | In scope? |
| --------------- | ----------------- | --------- |
| `app/globals.css`, `globals.test.ts` | 1 Tokens | yes |
| `components/nav/SiteNav.*`, `components/home/HeroBanner.*`, `components/home/MenuBand.*`, `components/menu/FeatureIcon.tsx`, `components/layout/SiteFooter.*`, `components/layout/AppBand.*`, `lib/content/footerLinks.*`, `app/layout.tsx` | 1 Desktop shell | yes |
| `components/nav/MobileToolbar.*`, `MobileTabBar.*`, `BackHeader.*`, `components/home/QuickPicks.*`, `CategoryBento.*`, `lib/menu/scrollToMenu.ts`, `components/menu/CategoryFilter.*`, `MenuItemCard.module.css`, `MenuList.module.css`, `components/voice/VoiceShell.module.css`, `components/nudges/NudgeToast.module.css` | 2 Mobile shell | yes |
| `components/chat/ChatInput.module.css` | 2 (the two-pane column overflowed; needed for AC3) | yes, needed for the phase to work |
| `app/menu/**`, `app/tag/**`, `components/menu/MenuLayout.*`, `MenuItemCard.tsx`, `MenuList.tsx`, `ItemDetailPanel.*`, `components/ui/Overlay.*`, `components/ui/AddedToast.*`, `lib/cart/useConfirmedAdd.ts`, `components/nudges/NudgeToast.tsx`, `lib/menu/routeCategory.*`, `lib/menu/featured.ts`, `apps/web/vitest.setup.ts` | 3 Menu routes, card, overlay, toast | yes |
| `app/(home)/*` (moved), `app/shell.module.css`, `app/error.tsx`, `app/cart/loading.tsx` (comment) | 3 (without the move, `notFound()` and `redirect()` answered 200; needed for AC6) | yes, needed for the phase to work |
| `app/search`, `app/offers`, `app/restaurants-nearby`, `app/profile`, `app/(static)/**`, `app/not-found.*`, `components/search`, `components/offers`, `components/stores`, `components/profile`, `components/layout/StaticPage.*`, `StaticContent.tsx`, `lib/content/{offers,stores,staticPages}.ts`, `lib/search/*` | 4 Pages | yes |
| `components/cart/CartList.*`, `CartLine.module.css`, `CartPanel.module.css`, `TotalCharges.*`, `DeliveryNote.*`, `app/cart/page.module.css`, `app/checkout/page.module.css` | 4 Cart page and checkout restyle | yes |
| `docs/features/mcdelivery-parity/*`, `docs/development/getting-started.md` | Plan and Phase 5 docs | yes |

**Result:** no unattributable file. Two in-phase changes went beyond the plan's
file table and were reported when they were made:
- the `(home)` route-group move, which affects every route's loading behaviour;
- the `useConfirmedAdd` extraction out of `NudgeToast`.

## Not reviewed

- **Browsers.** Only Chrome was used, for the side-by-side, Lighthouse and the
  keyboard walk. No screen reader was used.
- **Finding 3** is reasoned from the code, not reproduced. **Finding 5**
  (Chrome's close-watcher) is unverified.
- **The voice path end to end.** The `ShowItemDetail` → modal interaction
  while the voice sheet is open was not exercised. Voice needs a real
  microphone and speech recognition; the chat path was used instead, and
  ai-service's stale category ids (finding 14) limited even that.
- **The reviewer** read only the first 60 lines of `parity-checklist.md` and
  skimmed most CSS modules. It did not run the build or the browser. I did
  both, but my own reading of the CSS was limited to the parts touched by the
  findings.
- **Visual comparison.** The reference and our screenshots stay in the session
  scratchpad, so a later reviewer can't redo the comparison without
  recapturing them.

## Fixes applied (2026-10-05, after review)

The human approved fixing findings 1–4 ("yes please fix it"). Findings 5–14
are unchanged and remain open.

| # | Outcome | What changed | Verified by |
| - | ------- | ------------ | ----------- |
| 1 | Fixed | `lib/menu/routeCategory.tsx`: the provider clears the selection when it unmounts or its category changes, so the home page shows the whole menu again. In the same file, the reviewer's stale-frame companion is fixed too: a plain "synced" flag became "synced for this category id", so moving between category pages never shows the previous category for a frame. | Two new tests in `routeCategory.test.tsx`; each fails when its fix is reverted (checked). Browser on the Docker stack, 390×844: `/menu/burgers-wraps` → Home tab gives "All" pressed and 8 categories (before: only "Burgers & Wraps"). |
| 2 | Fixed | `components/menu/ItemDetailPanel.tsx`: the panel clears the open item when its page unmounts, and on mount drops any item left over from before. | Two new tests ("clears the open item when its page goes", "does not open an item left over"); both fail when the fix is reverted (checked). Browser: an item opened on `/`, then navigating to `/search`, leaves no dialog open (before: the same item reopened). |
| 3 | Fixed | `lib/cart/useConfirmedAdd.ts` gains `useAddSettled` (called once per finished add, with whether it succeeded). `useConfirmedAdd` is now built on it, behaving as before for `NudgeToast` and `AddedToast`. `ItemDetailPanel` closes only after an add that began during a click inside it: its own Add button or the suggestion below it. An add from a card, voice or chat leaves the detail open. | New tests: "closes after a confirmed add from a control inside it" and "stays open when an add started elsewhere is confirmed"; the second fails when the fix is reverted (checked). Browser: Add in the modal → Cart 0 → 1, the modal closes, the toast shows, and focus returns to the card. |
| 4 | Fixed (option: remove) | `lib/state/uiStore.tsx`: the `featureFilter` state, its action and `setFeatureFilter` are removed. `MenuList.tsx` no longer applies it. `lib/menu/featured.ts` keeps `filterByFeature` for `featuredItems`. `uiStore.test.ts` now covers the diet filter only. `MenuList.test.tsx` gained "says when the chip leaves nothing", restoring the empty-filter coverage the removed tests had. | `pnpm turbo run test` |

Checks after the fixes:
- `TURBO_FORCE=true pnpm turbo run typecheck lint test build` passed: 24/24
  tasks, 1453 tests (web 748, up from 741).
- The Docker route probe passed: 20/20.

Not re-run: Lighthouse and the side-by-side screenshots. None of the four
fixes changes markup or styling; they change state handling only.

One unexplained observation: during the browser re-check the dev cart showed 0
items, although earlier runs left 3. Nothing in these fixes touches the cart;
the browser had been restarted in between. I did not investigate further.
