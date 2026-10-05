# Parity checklist — McDelivery page-by-page parity

Phase 5 evidence for AC16 (and AC3, AC4, AC15). Run on 2026-10-05 against the
Docker dev stack (`infrastructure/docker/compose.dev.yaml`), Chrome DevTools,
desktop 1440×900 and mobile 390×844 (device emulation). Our screenshots and the
reference screenshots stay in the session scratchpad and are not committed: the
reference images show another company's trademarks and photography.

Judged on structure, layout and design tokens, not pixels — the brand, art and
copy are deliberately our own (OQ1). Out-of-scope differences
(`requirements.md` "Out of scope") are noted but never lower a result.

## 1. Stack and routes

`docker compose -f infrastructure/docker/compose.dev.yaml --env-file
infrastructure/docker/env/.env.dev up -d --wait`, then `ps`: postgres,
commerce-api, ai-service and web **healthy**; deps-node, deps-python and
dev-migrate **exited 0**.

Scripted probe (status, plus the last `h1` in the response body). An
unknown category or tag renders the not-found page with a real 404; `/menu`
is a 307 to the first category:

```text
/                        200 (want 200) PASS  h1=Our Menu
/menu                    307 (want 307) PASS  h1=
/menu/breakfast          200 (want 200) PASS  h1=Our Menu
/menu/no-such-category   404 (want 404) PASS  h1=
/tag/popular             200 (want 200) PASS  h1=Popular
/tag/deal                200 (want 200) PASS  h1=Deals
/tag/new-launch          200 (want 200) PASS  h1=New Launch
/tag/free-stuff          404 (want 404) PASS  h1=
/search                  200 (want 200) PASS  h1=Search
/offers                  200 (want 200) PASS  h1=Offers
/restaurants-nearby      200 (want 200) PASS  h1=Restaurants Nearby
/profile                 200 (want 200) PASS  h1=My Account
/faq                     200 (want 200) PASS  h1=FAQ
/about                   200 (want 200) PASS  h1=About Us
/privacy-policy          200 (want 200) PASS  h1=Privacy Policy
/terms-and-conditions    200 (want 200) PASS  h1=Terms &amp; Conditions
/sitemap                 200 (want 200) PASS  h1=Site Map
/cart                    200 (want 200) PASS  h1=Cart
/checkout                200 (want 200) PASS  h1=Checkout
/no-such-page            404 (want 404) PASS  h1=Page not found
```

Result: **20/20 PASS** (run before and after the Phase 5 fixes).

## 2. Side by side, per route and viewport

PASS = same structure and theme; PARTIAL = same structure, with visible in-scope
differences listed; FAIL = an in-scope element missing or broken; N/A = the
reference has no counterpart (behind its login, or no capture), themed check
only.

Counts after the Phase 5 fixes: **PASS 2 · PARTIAL 21 · FAIL 0 · N/A 11**
(34 rows; the two original FAILs are fixed and re-verified, listed as PARTIAL
for their remaining differences).

| Route | Viewport | Reference | Result | Notes |
|---|---|---|---|---|
| / | Desktop | desktop-home.png | PARTIAL | h1 "Our Menu". 96px sticky white header, red mode pill, location/"Now" pill, Offers, Restaurants Nearby, account, search, and a cart badge ✓ (extra red "Talk" pill). Yellow strip, black hero band, and 3 overlapping thumbnails ✓. "Our Menu" with 3 icon chips and a right-aligned search ✓. 3 columns: white rail with circle icons and a yellow right-edge bar on the active row, a 2-up card grid, and the cart column ✓. Card anatomy (badge, veg marker, image, name, one-line description, price, full-width yellow Add +, allergen/kcal strip) ✓. Bottom of page: SEO block, yellow "Discover with us" band, and black footer with pipe-separated links ✓. Differences: the search box has no yellow magnifier icon. The cart column is a summary card ("Cart (2) / Total / View cart") rather than the reference's line-item panel with its "N Items / View Cart" yellow bar. There is no thin vertical rule before the cart column. The rail has an added "All" row. A dev "Command log" card shows in the cart column. Out of scope: QR code and "Download the app" (app band uses "Get the app" button, no QR), % Off badges. |
| /menu/burgers-wraps | Desktop | desktop-home.png | PARTIAL | h1 "Our Menu" (category title "Burgers & Wraps" is an h2; the reference uses an h1 for the category title). Rail marks Burgers & Wraps active (yellow bar, bold) ✓. 2-up grid with 6 cards ✓. Cart column stays sticky under the header while scrolling ✓. Differences: the category route drops the hero band, the SEO block and the app band (page height 1908px; bottom shows the chat box, then the footer directly). The reference keeps the same home layout and only scrolls it. |
| /tag/popular | Desktop | desktop-tag-wise-menu.png | PARTIAL | h1 "Popular". 4-across full-card grid ✓, cream page ✓, card anatomy same as menu ✓. Differences: the reference uses a reduced header (logo plus right-hand links only); ours keeps the full header with the mode and location pills. The reference H1 is left-aligned (x≈40) inside a cream hero band with a bottom shadow; ours is centred with no band or shadow. |
| /menu/burgers-wraps (item detail) | Desktop | desktop-item-detail.png | PASS | Native dialog, about 600px wide, centred, cream body, page behind blurred and dimmed ✓. Large image, veg marker, name, price, full description, full-width yellow CTA ✓. h1 is still "Our Menu"; the dialog title is an h2. Small differences: allergens and dietary info are text rows ("Dietary: vegetarian", "Allergens: …"), not the reference's icon strip under the CTA. The description is dark text, not grey #909090. The close button shows a blue focus ring at open (programmatic focus) and overlaps the image's top-right corner. The CTA reads "Add to cart" instead of "Add +". Out of scope: "Customisable". |
| /search | Desktop | desktop-search.png | PARTIAL | h1 "Search". Full-width search input ✓, "Popular items" heading ✓. Differences: no Veg / Non-Veg pills under the input (the reference has them). Popular items use the full 4-up menu card instead of the reference's compact 5-up card (image popping above the card, round "+" button). Full header instead of the reduced one, with no search icon hidden. An extra "Search the menu" label sits above the input. Recent searches did not appear because none are stored, so that state was not verified. |
| /offers | Desktop | desktop-offers.png | PARTIAL | h1 "Offers". 4-across white coupon cards (radius and shadow) ✓, search filter ✓, "Demo offers — not redeemable" notice ✓ (OQ3). Differences: the reference H1 and the 400px search are centred; ours are left-aligned and the search has no magnifier icon. Card anatomy differs: the reference has a yellow code chip top-left and a flush red/black tag top-right ("FLAT125 OFF"). Ours has a "Demo offer" pill, a title, and an inline dashed "Code XXX" chip. There is no "Show More" link and no underlined min-cart footer. 6 cards vs 10. |
| /restaurants-nearby | Desktop | desktop-restaurants-nearby.png | PARTIAL | h1 "Restaurants Nearby". Store cards with name, address, Open/Closed in green/red, hours, and distance in tan ✓. "Demo data" label ✓. No geolocation prompt seen ✓. Differences: the reference is a single centred column about 540–580px wide of flush-stacked cards with a glyph left of the name and the distance at bottom-right. Ours is a 2-column grid about 930px wide with gaps, and the distance sits top-right. On this short page the footer ends at y≈796 and leaves a cream gap below it (no sticky footer). |
| /profile | Desktop | desktop-profile.png | PARTIAL | h1 "My Account". Centred column, white cards, chevron rows ✓. Differences: there is no "Hi" heading with a blue "Login / Sign Up" link. Ours has a "You are ordering as a guest" card with a yellow button. The row of 3 quick tiles (My orders / Offers / Settings) is missing. List rows have no leading line icons and link to site pages (Privacy…Restaurants Nearby) instead of the reference's account rows. No version line. The column is about 928px wide vs 720px. Out of scope: My orders, payments, address book. |
| /profile (login placeholder) | Desktop | desktop-login.png | PARTIAL | Centred dialog, cream, blurred backdrop ✓. "Hi there!", mobile field, and a disabled "Verify Mobile" (tan disabled state) ✓. "Sign-in is not available in this demo" notice ✓ (OQ4). Differences: the dialog is 600px wide with the content in a narrow 340px column, leaving wide empty side margins (the reference dialog itself is 340px). "Hi there!" is about 20px and left-aligned vs 36px and centred. No "Welcome" subtitle, no phone icon in the input, no Terms consent line. The close button has a heavy blue focus ring overlapping the header. Out of scope: OTP and the referral link. |
| /faq | Desktop | desktop-faq.png | PARTIAL | h1 "FAQ". Topic chips ✓. `<details>` accordions ✓ (8). Differences: no "Search your query here" box. Chips are white filled pills, not transparent with a 1px #CCC outline. Accordions are separate white rounded cards with a native left ▶ marker and bold question text. The reference uses flat hairline-divided rows, 16px regular text, and a right chevron (yellow when open). Ours adds group section headings. The H1 is shorter ("FAQ" vs "Frequently asked questions"); copy differences are fine. |
| /about | Desktop | desktop-about.png | PARTIAL | h1 "About Us". Uses the shared static-page template (big left H1, intro, H2 sections, paragraphs), as AC11 requires. The reference /about is a different layout: a small centred "About" title over a 600px white card list (Terms, FAQ, About, Version). That structure is not reproduced, which is a deliberate AC11 choice. The footer ends at y≈657, leaving about 240px of cream below on desktop. |
| /privacy-policy | Desktop | desktop-privacy-policy.png | PARTIAL | h1 "Privacy Policy". Template structure (H1, H2 sections, 16px body) and cream page ✓. Differences: the reference H1 is centred, ours is left-aligned. The text column is about 928px vs the reference's about 1200px (padding 0 120px). Footer ends at y≈772, leaving a cream gap below. Original placeholder copy as intended. |
| /terms-and-conditions | Desktop | inventory §16 (no image) | PASS | h1 "Terms & Conditions". Same shared template as privacy and about. The left-aligned H1 matches the inventory ("left on FAQ/T&C"). Section headings and paragraphs ✓. Same short-page cream gap under the footer. |
| /sitemap | Desktop | inventory §16 (no image) | PARTIAL | h1 "Site Map". 3-column link grid (Order / Menu / About) ✓, blue underlined links ✓, H2 section headings ✓. Differences: the inventory says the sitemap H1 is centred; ours is left-aligned. The content container is wider (about 1290px) than the other static pages (about 928px), so it is not quite the "one shared template". |
| /cart | Desktop | desktop-cart.png | PARTIAL | h1 "Cart". Two columns ✓. "Total Charges" is a `<details>` showing only ₹258 from the backend ✓. Delivery instructions is a local textarea ✓. A fixed white bottom bar (actionBar, top 836) holds "Total: ₹258" and "Proceed to checkout" ✓. Differences: line items have no thumbnail and no veg marker. The steppers are outlined squares, not the reference's filled tan minus and yellow plus. There is a text "Remove" link and no "Clear All". The nudge card spans both columns below them, not inside the left column. The page container is about 1290px vs about 1133px. A black footer sits above the fixed bar (the reference has none). The mode pill is not greyed out. document.title is just "QuickServe". Out of scope: recommendation carousel, donation, GST/handling, the "delivered over 12,700" stat banner, store/address strip, and login CTA. |
| /checkout | Desktop | none | N/A | h1 "Checkout". Renders in theme: white rounded card on cream, tan-bordered inputs, yellow "Continue to review", underlined "Back to cart", black footer ✓. document.title is "QuickServe". |
| /no-such-page | Desktop | none | N/A | h1 "Page not found". Themed: cream page, big H1, grey subtitle, yellow "Back to the menu", header and footer ✓. document.title is "QuickServe". |
| / | Mobile | mobile-home.png, mobile-home-menu-grid.png | PARTIAL (was FAIL — fixed, re-verified) | **Fixed in Phase 5:** the rail no longer covers the full-width row below the menu, and the page keeps room for the cart bar (re-check: 89/89 controls clear of the rail, mic and bars; last SEO line bottom 652 < cart bar top 694). Original capture: h1 "Our Menu". Red toolbar (Delivery/Take Away segmented switch, "SET YOUR LOCATION ▾", "Now ▾") ✓. Hero ✓. "Quick Picks" horizontal tiles ✓. Bento grid with full-width, rows of 2 and rows of 3 ✓. White cart bar above the floating tab bar (Home active with a yellow underline) ✓. FAIL because at the bottom of the page the sticky category rail (MenuLayout_rail, sticky top:130px, 76px column) is drawn over the nudge card and command log. The nudge "Add" button is under the rail (elementFromPoint at its centre returns a rail IMG). The last line of the SEO paragraph (bottom 724) is hidden behind the cart bar (top ≈694) and cannot be scrolled into view. Other differences: the full red toolbar (about 130px) stays sticky while scrolling; the reference collapses it to a compact address strip. The hero is an inset rounded card and shows desktop-style thumbnails; the reference hero is full-bleed with no thumbnails. Quick Picks shows a visible grey scrollbar track, and the mic FAB covers the "POPULAR" tile label. Bento tiles have no 1px border, and the full-width tile puts text left and image right (the reference has image above and centred title). Below the bento there is a second rail-plus-list menu (the reference home stops at the bento). Out of scope: the Get App top banner. |
| /menu/burgers-wraps | Mobile | mobile-menu.png | PARTIAL (was FAIL — fixed, re-verified) | **Fixed in Phase 5:** same rail fix (re-check: 28/28 controls clear). Original capture: h1 "Our Menu". Left category rail with circle icons and the active item highlighted ✓. List cards with veg marker, name, price, description, image, Add and allergen/kcal strip ✓. Tab bar shows Menu active ✓. FAIL because of the same overlap: at scroll bottom the sticky rail covers the nudge "Add" button (hit test returns a rail SPAN) and the left edge of the command log; the mic FAB also covers part of the rail and the log. Other differences: the reference menu page has a white "Our Menu" header with a search icon and a filter chip row (veg/non-veg toggles, Top Sellers…), and no red toolbar. Ours keeps the red toolbar (AC4 asks for it on menu), then "Our Menu", a search input and Veg/Non-Veg pills. Card layout differs: the reference has the name full-width on top, then image left and price/Add right. Ours has text left and image right, with the Add button overlapping the bottom of the image. Rail labels do not show item counts. |
| /tag/popular | Mobile | none (desktop only) | N/A | h1 "Popular". "‹ Back" header ✓. 1-column list cards ✓. Yellow cart bar plus tab bar ✓. Themed. |
| /menu/burgers-wraps (item detail) | Mobile | mobile-item-detail.png | PARTIAL | Bottom sheet (dialog 390x505 at y=339) with drag handle, blurred backdrop ✓. Image, veg marker, name, price, description and full-width yellow CTA ✓. Differences: there is no white sheet header row with a yellow back chevron and the category name ("Burgers & Wraps"). The close "×" is a large circle with a blue focus ring overlapping the image's top-right corner. Allergens are text rows. Out of scope: % Off and strike price, "Customisable". |
| /search | Mobile | mobile-search.png | PARTIAL | h1 "Search". "‹ Back" header, full-width input, "Popular items" ✓. Tab bar shows Search active ✓. Differences: no Veg / Non-Veg pills. The reference "Back" header carries a centred "Search Menu" title; ours shows a big H1 below the header. Popular items are 1-column list cards, not the reference's 2-up compact cards. The cart bar here is the yellow "2 items · ₹258 / View cart" variant, while home and menu use a white "Cart (2) Total: ₹258 [View cart]" bar; the style is inconsistent between routes. Recent searches not shown because none are stored. |
| /offers | Mobile | mobile-offers.png | PARTIAL | h1 "Offers". "‹ Back" header ✓. Search input ✓. 1-column coupon cards ✓ (the reference list was empty when captured). Differences: the reference puts "Offers For You" as a centred title inside the Back header and has a magnifier in the coupon input; ours uses a big H1 below the header and has no icon. Same card-anatomy difference as desktop: no yellow code chip and no flush corner tag. |
| /restaurants-nearby | Mobile | none (desktop only) | N/A | h1 "Restaurants Nearby". 1-column store cards ✓ (this matches the reference's single-column list better than desktop does). The cards have an unusually tall empty top padding. The mic FAB covers the third card's "Open" status until you scroll. |
| /profile | Mobile | mobile-profile.png | PARTIAL | h1 "My Account". "‹ Back" header ✓. Tab bar shows Account active ✓. Same differences as desktop: no "Hi" heading with a blue "Login / Sign Up" link, no 3 quick tiles, and list rows have no icons and are site links rather than account rows. Tab label is "Account" (vs brand "MyMcD"), which is fine. |
| /profile (login placeholder) | Mobile | mobile-login.png | PARTIAL | Bottom sheet with drag handle, blurred backdrop ✓. "Hi there!", demo notice, mobile field and disabled Verify ✓. Differences: the sheet is only 319px tall (the reference is nearly full height). "Hi there!" is about 22px vs the reference's large about 36px heading. No subtitle, phone icon or consent line. The close button has a blue focus ring overlapping the notice. |
| /faq | Mobile | none (desktop only) | N/A | h1 "FAQ". Back header, chips wrap to 2 rows, `<details>` cards ✓. Last question (bottom 648) clears the cart bar (top 698) ✓. Same card-style accordion difference as desktop. |
| /about | Mobile | none (desktop only) | N/A | h1 "About Us". Back header, template text ✓. Fits in one viewport. |
| /privacy-policy | Mobile | none (desktop only) | N/A | h1 "Privacy Policy". Back header, template, text clears the cart bar ✓. |
| /terms-and-conditions | Mobile | none | N/A | h1 "Terms & Conditions". Back header, template ✓. |
| /sitemap | Mobile | none | N/A | h1 "Site Map". The 3 groups stack into 1 column ✓. Blue links ✓. The last link (bottom 653) clears the dock (top 698) ✓. |
| /cart | Mobile | mobile-cart.png | PARTIAL | h1 "Cart". 1 column ✓. White fixed bar "Total: ₹258 / Proceed to checkout" sits above the tab bar (bar 696–760, dock 770–834) ✓. Total Charges, delivery-instructions textarea and nudge ✓. Differences: no item thumbnails or veg markers. Outlined square steppers instead of filled tan/yellow ones. "Remove" links and no "Clear All". No yellow address/"Now" strip under the Back header. At scroll bottom the mic FAB partly overlaps the nudge "Add" button (its centre is still clickable). The tab bar shows no tab active on /cart. Out of scope: recommendations, store strip, login CTA. |
| /checkout | Mobile | none | N/A | h1 "Checkout". Back header, white form card, tan inputs, full-width yellow "Continue to review" ✓. No tab bar or cart bar here (consistent with a non-primary route). |
| /no-such-page | Mobile | none | N/A | h1 "Page not found". Themed. Back header, tab bar and cart bar present ✓. |

## 3. Accessibility

- **Horizontal overflow:** none — `scrollWidth == clientWidth` on every route at
  both sizes; also 375, 1199, 1200 and 1280 on the home page (Phase 2).
- **One h1 per route**, including while dialogs are open (AC15).
- **Focus not obscured (WCAG 2.4.11)** — every focusable control in `main`
  focused in turn, checked against the header, the tab bar, the cart bars and
  the floating microphone: home 89/89, `/menu/burgers-wraps` 28/28 (after the
  fix), `/search` 17/17, `/cart` 8/8, `/faq` 12/12 (after the Phase 4 fix),
  `/sitemap` 22/22, `/profile` 8/8, `/checkout` 5/5, `/offers` 1/1 (mobile
  390×844); home 91/91 at 375×667 (Phase 2).
- **Keyboard walk (desktop):** 97 tab stops on the home page, each with a
  visible focus style; real Tab presses follow that order (logo → Delivery →
  location → Offers …). Enter on a card's Add → cart badge 2 → 3; Enter on the
  cart icon → `/cart`; Enter on "Proceed to checkout" → `/checkout`; the
  details typed and tabbed through (name → phone → email → Back to cart →
  Continue to review); Enter → "Review your order", focus on its heading.
  Stopped before "Place order" (no order created).
- **Item detail and login dialogs (desktop and mobile):** modal; focus starts
  on Close; Tab cycles Close → … → browser chrome → Close and never reaches
  the page; Escape closes and focus returns to the opener (Phase 3).
- **Lighthouse** (accessibility / best practices / SEO):

| Page | Device | Scores | Failed audits |
| ---- | ------ | ------ | ------------- |
| `/menu/burgers-wraps` | mobile | 100 / 100 / 100 | `label-content-name-mismatch` (mobile toolbar location — **fixed**, and menu-card detail buttons — pre-existing), `llms-txt` (not in scope) |
| `/` | mobile | 100 / 100 / 100 | `label-content-name-mismatch` (menu-card detail buttons only — pre-existing) |
| `/cart` | desktop | 100 / 100 / 100 | `label-content-name-mismatch` (desktop location pill — **fixed**, re-run clean), then only `cumulative-layout-shift` 0.106 (see follow-ups) |

## 4. Fixed during Phase 5

| Found by | Problem | Fix |
| -------- | ------- | --- |
| side-by-side, mobile `/` and `/menu/*` | The sticky rail stays stuck for its whole containing block, the layout grid, so it rode over the full-width row below the menu and covered the nudge's Add button | `MenuLayout.module.css`: that row is painted above the rail on the page background |
| side-by-side, mobile `/` | Nothing reserved room for the home page's fixed cart bar once the footer was hidden on mobile (Phase 2), so the last line could not scroll clear | `CartPanel.module.css`: the page keeps the bar's height free at its end while the bar is shown |
| Lighthouse | Mobile toolbar location button's name left out its second line | `MobileToolbar.tsx`: the name is the full visible text |
| Lighthouse | Desktop location pill: its second line now truncates with an ellipsis (Phase 1 icons), so a hand-written name no longer matches what is visible | `SiteNav.tsx`: the pill is named by its own content, with "(coming soon)" as visually hidden text |

## 5. Remaining differences (not fixed — for the human to decide)

In-scope PARTIAL differences, grouped; none breaks an acceptance criterion:

- **Header/search details:** no magnifier icon in the "Our Menu" and offers
  search boxes; no vertical rule before the cart column; reduced header on
  tag/search pages not reproduced.
- **Desktop cart column:** a summary card (count, total, View cart), not the
  reference's line-item panel.
- **Category route:** drops the hero, SEO block and app band (the reference
  keeps the full home layout); the category title is an h2.
- **Static template:** titles left-aligned where the reference centres them
  (privacy, sitemap, offers); sitemap and offers use the wide container; FAQ
  accordions are cards rather than hairline rows, chips filled rather than
  outlined, and there is no FAQ search; About uses the shared template rather
  than the reference's link-list card (a deliberate AC11 choice).
- **Restaurants:** a 2-column grid on desktop; the reference is one centred
  column.
- **Profile/login:** no "Hi" header with quick tiles or row icons; the login
  dialog is 600px around a 340px column, and the mobile sheet is short; the
  heading is smaller than the reference's.
- **Cart lines:** no thumbnails or veg markers, outlined steppers, no "Clear
  All"; no tab marked current on `/cart`.
- **Mobile:** the full red toolbar stays sticky (the reference collapses it);
  the hero keeps the desktop thumbnails; Quick Picks shows a scrollbar track;
  the mic covers part of some content until scrolled (never more than half of
  a focused control); cart bar style differs between home/menu (white) and
  other pages (yellow).
- **Item detail:** no sheet header row with a back chevron and category name.
- **Search:** no Veg / Non-Veg pills; full cards rather than the compact 5-up
  (desktop) or 2-up (mobile) cards.
- **Short desktop pages** end with a cream band below the footer (no sticky
  footer).
- **`document.title`** is just the brand on `/cart`, `/checkout` and the 404.

## 6. Not verified

- Recent-searches and sold-out card states in the side-by-side run (both are
  covered by unit tests).
- Reference pages behind its login (order tracking, addresses, payments) —
  out of scope.
- Browsers other than Chrome.
