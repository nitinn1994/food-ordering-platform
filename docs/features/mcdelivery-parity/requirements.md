# Requirements — McDelivery page-by-page parity (web-app theme)

**Approval Status:** APPROVED (2026-10-05, OQ1–OQ7 as recommended (a))
**Approved by:** human reviewer, 2026-10-05 ("approved")
**Risk:** MEDIUM
**Path:** Standard

## Risk justification

Classified by `/forge` on 2026-10-02; reused here. The highest dimension is
**Scope (MEDIUM)**: a frontend feature spread across the shell, home, menu,
cart and several new routes in `apps/web`.

- **Security:** LOW. No auth. The login entry stays a non-functional visual
  placeholder (OQ4).
- **Data:** LOW. New reads of existing endpoints only. No migration and no
  contract change (see OQ2, which keeps it that way).
- **Infrastructure:** LOW. The existing Docker dev stack is used as-is.
- **Reversibility:** LOW. The UI reverts with the code.

If OQ1 (b) or OQ2 (b) is chosen, a contract and schema change enters, the
data and API dimensions become MEDIUM–HIGH, and this needs `/forge` again.

## Problem

`docs/features/mcdelivery-redesign/` already gave `apps/web` the reference
site's colour feel and a 3-column desktop home. A page-by-page audit of
mcdelivery.co.in (2026-10-05) against our running Docker dev stack found these
gaps:

1. **Missing pages.** We have only `/`, `/cart` and `/checkout`. The
   reference also has:
   - category pages and tag pages
   - search, offers and restaurants nearby
   - a profile page for guests
   - FAQ, about, privacy, terms and sitemap
   - a footer that links to all of them
2. **Mobile is a different product on the reference.** It is an app-style
   shell:
   - a red rounded toolbar with a sliding Delivery / Take Away switch
   - Quick Picks and a bento grid of category tiles
   - a floating bottom tab bar (Home / Menu / Search / Account)
   - a two-pane menu (category rail plus list rows)
   - item detail as a bottom sheet
   - "‹ Back" headers on inner pages

   Our mobile page is the desktop page stacked into one column.
3. **Desktop details differ:**
   - the header is 96px, with a search icon and a cart badge
   - the hero is a yellow strip over a black band, with a thumbnail carousel
   - the menu chips have icons
   - cards have a "Customisable" line and an allergen and kcal strip
   - the side cart has a free-delivery strip and a "View Cart" bar
   - the item detail opens as a centred modal over a blurred page
   - an "Item added to cart" toast appears
   - below the menu come an SEO text block, an app-download band and a black
     footer
4. **The cart page is plain.** The reference uses two columns, with an order
   card, an expandable "Total Charges" section, delivery instructions and a
   fixed bottom action bar.

The full reference inventory is in `reference-inventory.md`, alongside this
file. Its screenshots stay in the session scratchpad and are not committed,
because they contain the reference's trademarks and photos.

## Goal

At 1440×900 and 390×844, every reference page that is public and needs no
login has a counterpart in our app with the same layout, components,
interaction pattern and design tokens. The brand is our own placeholder brand
(QuickServe). This is checked side by side against the live site on the Docker
dev stack.

## In scope

- **Design tokens.** Align `globals.css` with the measured values in
  `reference-inventory.md`:
  - colours
  - type scale (54/44/36/25/24/20/18/16/14/13/12) and 700 weight
  - radii (4/6/10/16–20/pill)
  - card and modal shadows, and a 96px desktop header
  - a desktop/mobile switch at 1200px in CSS, not JS
- **Desktop shell.** Header (search icon, cart icon with count badge), hero
  carousel (yellow strip, black band, thumbnail selector, no autoplay library),
  chips with icons, SEO block, app-download band (no QR code or real store
  links), black footer.
- **Mobile shell.** Red rounded toolbar with mode switch, location and "Now".
  Floating bottom tab bar (Home / Menu / Search / Account) with the cart bar
  above it. Mobile home with Quick Picks and a bento category grid. Two-pane
  mobile menu with list rows. Item detail as a bottom sheet. "‹ Back" header
  on inner pages.
- **Menu presentation:**
  - card anatomy: "Customisable" only when the item really is (see OQ1),
    allergen and kcal strip, sold-out state from `available: false`
  - item-detail modal over a blurred page
  - "Item added to cart" toast
  - mobile filter chips for the dietary tags the menu already has
- **New routes**, server- or client-rendered from the existing
  `GET /v1/menu`, cart and order endpoints:
  - `/menu/[categoryId]`
  - `/tag/[feature]` (popular / deal / new-launch, from the existing
    `featured[]`)
  - `/search`: client-side search over the menu, recent searches in
    `localStorage`, popular items from `featured`
  - `/offers`: display only (OQ3)
  - `/restaurants-nearby`: a static demo store list (OQ5)
  - `/profile`: the guest view, with a placeholder login entry
  - `/faq`, `/about`, `/privacy-policy`, `/terms-and-conditions`, `/sitemap`:
    original placeholder copy on the shared static-page template
- **Cart page parity:**
  - two columns, order card, expandable "Total Charges"
  - delivery instructions as a local note, not sent to the API
  - fixed bottom action bar
  - checkout keeps its existing flow and is restyled only
- **Not-found page** in the reference's static-page style. The reference
  itself has none; its server returns 403 and the app redirects home.
- **Verification on the Docker dev stack:** side-by-side screenshots of every
  in-scope page at both sizes, recorded in a parity checklist
  (`parity-checklist.md`).

## Out of scope

- **Customisation and combo builder** (variant step, "Make it a Quick Meal",
  add-ons, sauces). It needs a modifier data model in contracts and
  commerce-api; see OQ1.
- **Strike-through prices and "% Off" badges.** There is no discount data,
  and the contract deliberately forbids a discount claim with nothing behind
  it (`api-contracts/src/menu.ts`, `MENU_ITEM_BADGES`); see OQ2.
- **Pages behind the reference's login:**
  - login and OTP, sign-up, referral
  - saved addresses and the address picker
  - order history and tracking, payments, feedback
- **Take Away flow behaviour.** The mode switch and "Now" are visual only, and
  there is no scheduled delivery.
- **The rest of the reference cart and site:** coupon application, the
  donation checkbox, handling charge and GST lines (the backend has no such
  values), the recommendations carousel beyond the existing nudges, the
  "Get App" top banner and QR code, `/bug-bounty`, `/restaurant-links` (427
  store tiles) and individual restaurant pages.
- **Reference brand assets.** We use none of: logo, Golden Arches glyph,
  Speedee font, product photos, banner art, product names, brand copy.
- **Backend, contract and ai-service changes**, and dark mode.

## Acceptance criteria

**Tokens and shell**

- [ ] **AC1 Tokens.** `globals.css` defines the token values in
  `reference-inventory.md` "Design tokens". No component module adds a brand
  hex value of its own (grep). The `globals.test.ts` contrast checks still
  pass for every text/background token pair.
- [ ] **AC2 Desktop header.** At 1440 wide, the header is 96px and sticky. In
  order it shows: logo, mode pill, location/"Now" pill, Offers, Restaurants
  Nearby, account, search icon (links to `/search`), cart icon with a badge
  showing the backend item count.
- [ ] **AC3 Breakpoint.** At ≥1200px the desktop layout renders, and below
  1200px the mobile layout. Both are switched by CSS media queries, so there
  is no layout flash on hydration and no JS width check. At 390×844 there is
  no horizontal scroll on any in-scope route.
- [ ] **AC4 Mobile shell.** Below 1200px:
  - the red toolbar (mode switch, location, "Now") shows on home and menu
  - the floating bottom tab bar shows on every primary route, with the
    current tab marked `aria-current="page"`
  - inner pages show a "‹ Back" header
  - the cart bar sits above the tab bar and never covers a focused control
    (the WCAG 2.4.11 check from the redesign review, re-run)

**Pages**

- [ ] **AC5 Home.** Desktop: yellow strip, black hero band, a keyboard-operable
  thumbnail carousel (no autoplay, or autoplay with a pause control), "Our
  Menu" with icon chips and search, 3 columns, SEO block, app band, black
  footer. Mobile: hero, Quick Picks, bento category grid with the
  full-width / rows-of-2 / rows-of-3 pattern.
- [ ] **AC6 Category and tag routes.**
  - `/menu/[categoryId]` renders that category with the rail item marked
    active. An unknown id gives the not-found page with a 404 status.
  - `/tag/[feature]` renders the 4-across grid (desktop) for `popular`,
    `deal` and `new-launch`. Any other value gives a 404.
  - Unavailable items show the greyscale "Sold out" state and no Add button.
- [ ] **AC7 Card and detail.** A card shows: veg/non-veg marker, image, name,
  one-line description, price, Add button, allergen and kcal strip. A
  "Customisable" line appears only if OQ1 provides data. Item detail opens as
  a centred modal over a blurred backdrop (desktop) or a bottom sheet with a
  drag handle (mobile). Both trap focus, close on Escape and return focus to
  the trigger. Adding an item shows an "Item added to cart" toast only after
  the backend confirms the add.
- [ ] **AC8 Search.** `/search` filters the menu as you type (name and
  description, case-insensitive). It shows recent searches (most recent 5,
  stored locally, clearable) and popular items. An empty result shows a
  "no results" state.
- [ ] **AC9 Offers.** `/offers` shows the coupon-card grid (4 across on
  desktop, 1 on mobile) with a search filter. Cards are display only: nothing
  applies a discount or changes the cart or the totals (OQ3).
- [ ] **AC10 Restaurants nearby.**
  - `/restaurants-nearby` shows a list of store cards (name, open status,
    hours, distance) from a static demo fixture in `apps/web` labelled
    "Demo data".
  - No browser geolocation is requested.
  - With no stores, the page shows the reference's empty state.
- [ ] **AC11 Static pages.**
  - `/faq` has topic chips and accordion questions using `<details>`, so they
    work without JS.
  - `/about`, `/privacy-policy`, `/terms-and-conditions` and `/sitemap` use
    one shared template with original placeholder copy.
  - Every footer link resolves to an in-app route or is explicitly marked as
    not available. There are no dead `#` links.
- [ ] **AC12 Profile and login placeholder.** `/profile` shows the guest view.
  The login entry opens a modal styled like the reference ("Hi there!", a
  mobile field, a disabled "Verify Mobile" button), labelled "Sign-in is not
  available in this demo". Nothing is submitted (OQ4).
- [ ] **AC13 Cart page.**
  - `/cart` has two columns on desktop and one on mobile.
  - The order card has steppers.
  - "Total Charges" expands and shows only backend-provided amounts.
  - Delivery instructions are a local textarea.
  - A fixed bottom bar holds "Proceed to Checkout", which goes to the
    existing `/checkout`.
  - An empty cart shows the empty-bag state.

**No regressions**

- [ ] **AC14 Functional parity kept.** Every existing behaviour still works on
  every new surface: cart add/update/remove, checkout, nudges with their
  ethics guardrails, voice/chat with its UI commands, and the command log in
  dev only. The existing web tests pass, and every test changed only because
  of markup is listed with the reason.
- [ ] **AC15 Accessibility.**
  - Each route has exactly one `h1`.
  - Landmarks: header, main, footer or the tab-bar nav.
  - Every control has an accessible name that contains its visible label.
  - Yellow buttons and red badges meet 4.5:1 contrast.
  - Keyboard alone reaches every control on every in-scope route.

**Verification**

- [ ] **AC16 Docker verification.** With
  `docker compose -f infrastructure/docker/compose.dev.yaml --env-file infrastructure/docker/env/.env.dev up -d --wait`:
  - all services are healthy
  - every in-scope route returns 200 and renders its `h1` (body grepped, not
    just the status)
  - `parity-checklist.md` records a pass/fail per route × viewport against
    the reference screenshots, with every fail explained

## Open questions (recommendation first)

- **OQ1 Customisation and combo builder.**
  - (a, recommended) Out of scope here. Plan it as a separate feature that
    adds a modifier model (contracts, commerce-api migration, cart line
    options, ai-service). "Customisable" is not shown until then.
  - (b) Include it now. That makes this HIGH risk on the Full Path, and it
    needs `/forge` again.
- **OQ2 Discount presentation (strike-through price, "% Off").**
  - (a, recommended) Omit, consistent with the contract's no-unbacked-claims
    rule.
  - (b) Add an optional `compareAtPriceCents` to the menu contract and seed.
    That is a contract and data change.
- **OQ3 Offers page.**
  - (a, recommended) Display-only demo coupon cards from a static fixture,
    marked "Demo offers — not redeemable".
  - (b) Omit the page and leave the header "Offers" as a placeholder.
- **OQ4 Login modal.**
  - (a, recommended) A visual-only modal with the input disabled and a clear
    "not available in this demo" notice, so no phone number is ever
    collected.
  - (b) Keep today's "Coming soon" placeholder button.
- **OQ5 Store list.**
  - (a, recommended) A static fixture in `apps/web`, with no geolocation.
  - (b) A commerce-api `GET /v1/stores` endpoint. That is new domain, contract
    and data work, so it would be its own feature.
- **OQ6 Typeface.**
  - (a, recommended) Keep the heavy system stack (redesign OQ6), with no
    network fetch.
  - (b) An open font closer to the reference's rounded geometric sans via
    `next/font/google`. It is fetched at build time, so it affects the Docker
    and CI builds.
- **OQ7 Phase split.** Five phases is at the limit; see `plan.md`.
  - (a, recommended) Approve all five, with a review checkpoint after
    Phase 2.
  - (b) Approve Phases 1–2 (shell) now and Phases 3–5 later.
