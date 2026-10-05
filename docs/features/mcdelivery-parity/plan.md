# Plan — McDelivery page-by-page parity (web-app theme)

**Approval Status:** APPROVED (2026-10-05, OQ1–OQ7 as recommended (a))

## Approach

The work is in `apps/web` only. It extends the redesign's existing pieces
rather than building a parallel set:

- **Tokens.** `globals.css` custom properties stay the single source, and
  component CSS modules keep consuming them. There is still no Tailwind and
  no UI library.
- **One component tree, two layouts.** The desktop/mobile switch is a CSS
  media query at 1200px (`--bp-desktop`). The reference switches in JS, and
  copying that would cause a hydration flash and break SSR. Where the two
  layouts genuinely differ in markup (the tab bar, the toolbar, the bento
  grid), both are rendered and the inactive one is set to `display: none`.
  Those surfaces are small.
- **Data.** New routes read only the existing endpoints, through the existing
  `lib/menu/menuSource.ts` (server) and `lib/state/cartStore` (client). Demo
  data that the backend does not own (stores, offers, static copy) lives in
  typed fixtures under `apps/web/src/lib/content/`, and each fixture is
  labelled as demo data in the UI.
- **Routes.** These are new App Router segments next to `cart/` and
  `checkout/`. `/menu/[categoryId]` and `/tag/[feature]` reuse the home
  page's `MenuList` / `CategoryFilter` with an initial selection, so
  filtering, voice commands (`ShowMenuCategory`, `HighlightItem`) and nudges
  keep working unchanged.
- **Modal and sheet.** One `Overlay` primitive: the native `<dialog>` element
  with `showModal()`, which gives focus trap, Escape and inert background for
  free. It becomes a centred modal on desktop and a bottom sheet on mobile,
  in CSS. `ItemDetailPanel` moves into it, and the login placeholder uses it
  too.

## Affected files

| Area | Change | Why |
| ---- | ------ | --- |
| `src/app/globals.css` (+ `globals.test.ts`) | modified | tokens: type scale, radii, shadows, header 96px, `--bp-desktop` |
| `src/app/layout.tsx` | modified | add `SiteFooter`, `MobileTabBar` |
| `src/app/page.tsx`, `page.module.css` | modified | hero, Quick Picks, bento (mobile), SEO block, app band |
| `src/app/menu/[categoryId]/page.tsx` | new | category route |
| `src/app/tag/[feature]/page.tsx` | new | tag grid route |
| `src/app/search/`, `offers/`, `restaurants-nearby/`, `profile/` | new | pages |
| `src/app/(static)/faq|about|privacy-policy|terms-and-conditions|sitemap/` | new | shared static template |
| `src/app/not-found.tsx`, `cart/page.tsx` (+ css) | modified | restyle, two-column cart |
| `src/components/nav/SiteNav.*` | modified | search icon, cart badge, 96px; mobile red toolbar |
| `src/components/nav/MobileTabBar.*`, `BackHeader.*` | new | mobile shell |
| `src/components/layout/SiteFooter.*`, `AppBand.*`, `StaticPage.*` | new | footer, app band, static template |
| `src/components/home/HeroBanner.*` | modified | strip, black band, thumbnail carousel |
| `src/components/home/MenuBand.*`, `QuickPicks.*`, `CategoryBento.*` | modified / new | chips with icons; mobile home |
| `src/components/menu/MenuItemCard.*`, `MenuList.*`, `CategoryFilter.*` | modified | card anatomy, sold-out, mobile list rows, initial selection |
| `src/components/menu/ItemDetailPanel.*` | modified | renders inside `Overlay` |
| `src/components/ui/Overlay.*`, `Toast.*` | new | modal/sheet primitive; "Item added" toast |
| `src/components/cart/CartPanel.*`, `CartLine.*` | modified | free-delivery strip, View Cart bar, order card |
| `src/components/cart/TotalCharges.*`, `DeliveryNote.*` | new | expandable totals (backend amounts only), local note |
| `src/components/search/*`, `offers/*`, `stores/*`, `profile/LoginPlaceholder.*` | new | page components |
| `src/lib/content/{stores,offers,staticPages,footerLinks}.ts` | new | typed demo fixtures |
| `src/lib/search/recentSearches.ts` | new | `localStorage` with try/catch (the search itself reuses `lib/menu/filter.ts`) |
| `public/brand/*`, `public/menu/*` | new | original SVG hero slides, app band art |
| co-located `*.test.ts(x)` | new / modified | see test-plan |
| `docs/features/mcdelivery-parity/parity-checklist.md` | new | Phase 5 evidence |
| `docs/development/getting-started.md` | modified | route list, Docker verification note |

Exact file names inside existing directories are confirmed at the start of
each phase. Any file created beyond this table is reported.

## Phases

### Phase 1 — Tokens and desktop shell
- [ ] Token update and `--bp-desktop`. `globals.test.ts` contrast pairs extended.
- [ ] `SiteNav` desktop: 96px, search icon → `/search`, cart icon with count badge.
- [ ] `HeroBanner`: yellow strip, black band, 2–3 original SVG slides, thumbnail selector (buttons, `aria-pressed`, arrow keys).
- [ ] `MenuBand` chips with icons, linking to `/tag/[feature]`.
- [ ] `SiteFooter` (black, link columns from `footerLinks.ts`), `AppBand`, SEO text block.
- **Done when:** AC1, AC2 and AC5 (desktop half) hold. Web typecheck, lint, test and build PASS.

### Phase 2 — Mobile app shell
- [ ] Red rounded toolbar (mode switch visual, location, "Now"). `MobileTabBar` (Home / Menu / Search / Account). `BackHeader`.
- [ ] Mobile home: `QuickPicks`, `CategoryBento`.
- [ ] Mobile menu: two-pane rail plus list rows. Cart bar above the tab bar, using `--cart-bar-height` + `--tabbar-height` in scroll-padding.
- **Done when:** AC3, AC4 and AC5 (mobile half) hold. **Review checkpoint** (OQ7 a): screenshots of home at both sizes shared before Phase 3.

### Phase 3 — Menu routes, card, detail overlay, toast
- [ ] `/menu/[categoryId]` and `/tag/[feature]`, using `notFound()` for unknown values.
- [ ] Card anatomy and sold-out state. `Overlay` primitive. `ItemDetailPanel` inside it. `Toast` on confirmed add.
- [ ] Voice/UI commands verified on the new routes (`ShowMenuCategory` on `/menu/x` still selects in place).
- **Done when:** AC6, AC7 and AC14 (menu part) hold.

### Phase 4 — Search, offers, stores, profile, static pages, cart page
- [ ] `/search` (pure `searchMenu`, `recentSearches`). `/offers` (fixture, display only). `/restaurants-nearby` (fixture).
- [ ] `/profile` and `LoginPlaceholder` in `Overlay`. Static template plus five pages. `not-found` restyle.
- [ ] `/cart`: two columns, `TotalCharges`, `DeliveryNote`, fixed action bar. Checkout restyle only.
- **Done when:** AC8–AC13 and AC15 hold.

### Phase 5 — Docker verification and parity checklist
- [ ] Dev stack up. Scripted curl of every route (status plus `h1` grep).
- [ ] Chrome DevTools screenshots of every route at 1440×900 and 390×844 into the scratchpad, compared with the reference set.
- [ ] `parity-checklist.md` (route × viewport × pass/fail/reason). Keyboard walk and Lighthouse a11y on home, menu, cart.
- [ ] `getting-started.md` route list.
- **Done when:** AC16 holds and the full web check set PASSES.

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| "Exactly like" drifts into trade-dress copying | legal | Layout, tokens and patterns only. Original name, logo, SVG art and copy. Reference screenshots are not committed. |
| Two layouts double the markup and the test surface | bloat, drift | One tree. Only the shell pieces (toolbar, tab bar, bento) are layout-specific. Tests assert on roles and names, not on layout. |
| Moving the item detail into a `<dialog>` breaks existing tests and voice `HighlightItem` | regressions | Keep accessible names. `HighlightItem` still scrolls and highlights the card; opening the detail stays a user action. Every changed test is listed. |
| Fixed cart bar plus tab bar hide focused controls on mobile | a11y | Combined scroll-padding token, re-run the redesign's 22-control focus check at 375×667 and 390×844. |
| Demo fixtures read as real offers or stores | user confusion | Visible "Demo" labels. Offers cannot change the cart or totals (AC9). |
| `next build` while the Docker `next dev` runs | broken dev server (memory note) | Build on the host only with the dev stack's web stopped, or restart the dev stack after building. |
| Docker host reboots stop the stack (seen 2026-10-05) | false "fail" on verification | Phase 5 begins with `up -d --wait` and a `ps` health check. |

## Assumptions

- Verified: the dev stack comes up healthy and serves the 8-category, 30-item
  demo menu (`up -d --wait`, `ps`, curl of `/` and `/api/commerce/v1/menu`,
  2026-10-02 and again 2026-10-05).
- Verified: the menu contract has `featured[]` (`popular`, `deal`,
  `new-launch`), `available`, `calories`, `allergens`, `dietaryTags`,
  `weightGrams` and `badge`. There are no discount or modifier fields
  (`api-contracts/src/menu.ts`).
- Verified: commerce-api exposes only the menu, cart, orders (POST, GET by
  id), nudges and health endpoints, so there is no store or offer source.
- Verified: the reference has no public 404 page and no "Track order" link
  (audit).
- Not verified: reference pages behind login. Out of scope.
- Not verified: the reference's exact behaviour between 1201 and 1279px
  (audit: the switch lies in that range). We pick 1200px.

## Open questions

See `requirements.md` OQ1–OQ7. The recommendation is listed first for each.

## Not doing

Customisation/combo builder, discount fields, login/OTP, addresses, order
tracking, Take Away behaviour, coupon redemption, store API, geolocation,
any backend, contract or ai-service change, and unrelated refactors.

## Specialised review needed?

Standard Path, so none is required. Accessibility gets the extra checks in
Phase 5 (keyboard walk, Lighthouse) because the overlay and fixed bars are
the main a11y risk.
