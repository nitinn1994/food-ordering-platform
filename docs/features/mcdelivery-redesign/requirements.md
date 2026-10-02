# Requirements — McDelivery-style redesign, nudge architecture, voice-first AI

**Approval Status:** APPROVED (2026-09-27, OQ1–OQ8 as recommended) — per OQ8 (a), approval covered **Feature A (Phases 1–2)** first; **Phases 3–5 approved 2026-10-01** after Feature A was reviewed
**Approved by:** human reviewer, 2026-09-27 ("approved")
**Risk:** HIGH
**Path:** Full

## Risk justification

The highest dimension wins (`.claude/commands/forge.md`). Classified by
`/forge` on 2026-09-27; reused here.

| Dimension | Level | Why |
| --- | --- | --- |
| Scope | **HIGH** | All three apps and `packages/contracts`. Adds a new subsystem (nudges) that crosses the web → ai-service → commerce-api boundary. |
| Security impact | MEDIUM | No auth change. It adds a new read endpoint, one new tool and one new UI command, and all of them go through the existing validated paths. Voice keeps its ADR-0023 trust model. |
| Data impact | **HIGH** | A new migration (`0002`) adds menu columns and changes the seed. Nudge dismissals stay client-side, so no user data is stored (OQ4). |
| API compatibility | MEDIUM–HIGH | Every contract uses `z.strictObject`. A new field on `menuItemSchema` is rejected by any consumer that has not been updated, including ai-service's generated Pydantic models. All consumers must be updated in the same change. |
| Infrastructure | LOW | No new service, port, proxy path or environment variable. |
| User / business impact | MEDIUM | Nudges shape what customers buy, so a dark pattern here is a real harm. Guardrails are acceptance criteria (AC-N5). |
| Reversibility | MEDIUM | Migration `0002` has a `down`. UI and nudges revert with the code. |

Result: **HIGH → Full Path.**

## Problem

The web app renders a plain, developer-styled page (`system-ui`, no theme
tokens, a USD menu of 6 items in 3 categories). The product owner wants:

1. A visual design modelled on McDelivery India (mcdelivery.co.in).
2. Backend support for the richer menu that design needs.
3. A **nudge pattern architecture**: contextual suggestions (sides, drinks,
   desserts, time-of-day items) shown at the right moment, without being
   manipulative.
4. A **voice-first** experience. Today voice is a small tap-to-talk button
   inside the chat box (Phase 16). It should become the primary way to order.

## Reference design (captured 2026-09-27 from mcdelivery.co.in, desktop 1366px)

| Element | Observed |
| --- | --- |
| Page background | warm cream `#FBF6F0` |
| Primary red | `#DA0005` (mode pill, discount badges) |
| Primary yellow | `#FFBC0B` (Add buttons, active-category bar, strip under header) |
| Text | `#2B2B2B`, muted `#909090`, brown accent `#A87C4F` / `#B69A81` (chips, allergen icons) |
| Font | "Speedee", McDonald's proprietary typeface, heavy weights for headings |
| Header | white, sticky: logo · red "Delivery" mode pill · location + "Now" time pill · Offers · Restaurants Nearby · account icon · search icon |
| Hero | full-width promotional banner carousel |
| "Our Menu" | large heading · pill chips "For You", "Deals", "New Launch" · rounded search box on the right |
| Body | three columns: **left** category rail (round thumbnail + name, yellow bar on the active one) · **centre** 2-up product-card grid under a category heading with "Veg / Non-Veg" filter chips · **right** sticky "Your Cart" card with an illustrated empty state |
| Product card | white, 10px radius · veg/non-veg square marker (top right) · optional red "20% Off" badge (top left) · image · bold name · one-line truncated description · ₹ price · full-width yellow **Add +** button · "Customisable" caption · allergen icon row · weight (g) and kcal |
| Radii | 4–10px cards and inputs, 20–50px pills |

## Goal

The home, cart and checkout routes adopt that layout and visual language
under original, non-infringing branding. The menu comes from commerce-api
with the fields the design needs. commerce-api computes rule-based nudges from
the server-side cart and menu, and they appear on screen and in voice replies.
Voice is the most prominent way to start an order. It still uses the Phase 16
browser-speech adapters and the same single agent turn.

## In scope

**UI / theme (apps/web)**
- Design tokens (colour, type, radius, spacing, elevation) as CSS custom
  properties in `globals.css`. Existing CSS modules are restyled to use them.
- New layout: sticky header, hero banner, "Our Menu" band with chips and
  search, three-column menu (category rail · card grid · sticky cart), and a
  mobile layout (horizontal category scroller, bottom cart bar).
- Product card redesign (marker, badge, image, price, Add +, allergens,
  weight/kcal) and an empty-cart illustration.
- `/cart` and `/checkout` restyled to match. No behaviour change.
- Currency and locale switched to INR / `en-IN` (OQ3).

**Menu data (commerce-api, api-contracts, ai-service models)**
- Migration `0002`: nullable `image_url`, `weight_grams`, `badge`, and a
  `featured` flag set (`new_launch`, `deal`) on items. Nullable `image_url` on
  categories.
- A larger seed of generic QSR items: about 8 categories and about 30 items,
  with INR prices and placeholder images served from `apps/web/public/`.
- The new fields are added to `menuItemSchema` / `menuCategorySchema`, the
  JSON Schema is regenerated, and ai-service's Pydantic models are regenerated.

**Nudge architecture (commerce-api, contracts, web)**
- A `nudges` module in commerce-api: typed, code-defined rules. The pipeline
  is trigger → eligibility → guardrails → rank → deliver.
- `GET /v1/nudges?surface=<surface>[&itemId=]`, computed from the caller's
  server-side cart and the menu. Read-only.
- Surfaces: `cart` (complete your meal), `post_add` (after an item is
  added), `item_detail` (pairs well with), `voice` (one spoken suggestion).
- A web nudge UI (inline card, post-add toast) with explicit Add and Dismiss.
  Frequency caps and dismissals are per session.

**AI + voice-first (ai-service, contracts, web)**
- A new read-only ai-service tool `get_nudges` (commerce-api HTTP only).
- A new UI command `ShowNudge { nudgeId, surface }`. It references a nudge;
  it never carries prices or copy of its own.
- The simulated model: after a successful `add <item>`, it asks for a `voice`
  nudge and adds at most one suggestion sentence to its reply.
- Voice-first shell: a prominent mic button in the header and a floating
  button on mobile, a voice sheet (listening, interim transcript, reply,
  suggested prompts), and a first-visit voice prompt. Text and touch keep full
  parity.
- A spoken nudge may be accepted with a short "yes" or declined with "no".
  The web resolves this as the same user action as tapping that nudge's Add or
  Dismiss (OQ5).

## Out of scope

- McDonald's trademarks, logos, the "Speedee" font, product names ("McMuffin",
  "McSaver", …) or product photography (OQ1).
- Real location, restaurant finder, delivery-time selection, Offers page,
  account/login. The header shows them as visual placeholders only (OQ2).
- Combos and customisation or modifiers. "Customisable" is not shown until a
  modifiers phase exists.
- Real AI model, real voice provider, wake word or always-listening mic
  (`CLAUDE.md` initial scope; ADR-0023 privacy model).
- ML or personalised recommendations, nudge analytics, A/B testing, stored
  per-user dismissal history.
- Payments, auth, deployment changes.

## Acceptance criteria

### Theme and layout
- [ ] AC-U1: `globals.css` defines the token set (at least `--color-brand-red`,
  `--color-brand-yellow`, `--color-bg`, `--color-text`, `--color-muted`,
  `--color-accent`, radius and spacing scales). No component CSS module adds a
  new hard-coded brand colour hex. A grep check is in the test plan.
- [ ] AC-U2: At ≥1024px the home page shows header, hero, "Our Menu" band,
  category rail, card grid and a sticky cart column. At ≤640px it shows a
  horizontal category scroller, a single-column grid and a bottom cart bar,
  with no horizontal page scroll.
- [ ] AC-U3: Each product card shows the veg/non-veg marker, optional badge,
  image (or placeholder), name, truncated description, ₹ price, an "Add"
  button, allergens, and weight/kcal when present.
- [ ] AC-U4: Selecting a category in the rail filters the grid to that
  category and marks it pressed (`aria-pressed`). "All" shows every
  category. This is the Phase 2 toggle-button pattern that
  `ShowMenuCategory` already targets. The "Popular / Deals / New Launch"
  chips and the Veg / Non-Veg chips filter the grid too.
  *Amended 2026-10-01 at final review. It originally read "scrolls to that
  section and marks it active (`aria-current`)". The rail keeps filter
  semantics because UI commands and the existing tests depend on them
  (review note 12). Scroll-to-section would be a separate change.*
- [ ] AC-U5: Prices render as INR (`₹165`) everywhere: menu, cart, checkout,
  confirmation.
- [ ] AC-U6: No McDonald's logo, font, product name or photo is in the
  repository. The app name and logo are placeholders (OQ1).
- [ ] AC-U7: All pre-existing web behaviours (cart CRUD, checkout, chat,
  voice, UI-command dispatch) still pass their tests. Tests changed only
  because of markup or class changes are listed in the implementation report.
- [ ] AC-U8: The design is light-only, like the reference (`color-scheme:
  light`; OQ7). Colour contrast ≥ 4.5:1 for body text
  and ≥ 3:1 for large text and the Add button label. Every interactive
  element keeps a visible focus ring.

### Menu data
- [ ] AC-M1: `db:migrate` applies `0002`. `db:migrate:down` reverts it.
  A second run is a no-op.
- [ ] AC-M2: `db:seed` loads the new seed idempotently. `GET /v1/menu`
  returns the new fields, and they validate against the updated
  `menuResponseSchema`.
- [ ] AC-M3: ai-service's generated models accept the new menu. `get_menu`
  still works (ai-service tests).
- [ ] AC-M4: Items without an image, badge or weight still render and
  validate (the fields are nullable or optional).

### Nudges
- [ ] AC-N1: `GET /v1/nudges?surface=cart` with a cart containing a main and
  no side returns a "complete your meal" nudge for an available side. With an
  empty cart it returns `[]`.
- [ ] AC-N2: Every nudge references an existing, available menu item. Its
  price comes from the menu at request time and is never stored in the rule.
- [ ] AC-N3: At most 1 nudge per surface per response. Never a nudge for an
  item already in the cart. Never a nudge on the checkout route.
- [ ] AC-N4: Invalid `surface` or `itemId` returns the structured 400 error
  model (Phase 6).
- [ ] AC-N5 (guardrails): Nudges never add to the cart without an explicit
  Add, "yes" or tool call. They carry no countdowns or scarcity claims, are
  always dismissible, and are shown at most 3 times per session and once per
  item. Once dismissed they are not shown again in that session.
- [ ] AC-N6: Accepting a nudge goes through the existing `POST
  /v1/cart/items` path. The cart re-reads afterwards (backend-confirmed
  state).

### AI and voice-first
- [ ] AC-V1: `ShowNudge` is in `ui-commands` (zod + regenerated JSON Schema).
  The web dispatcher renders it only if the referenced nudge came from
  `GET /v1/nudges`, and otherwise ignores it and logs it.
- [ ] AC-V2: ai-service `get_nudges` is allowlisted and read-only, and calls
  only commerce-api. The simulated `add <item>` turn produces a reply with at
  most one suggestion sentence plus a `ShowNudge` command when a nudge exists.
- [ ] AC-V3: The mic is reachable from every route's header (desktop) and as
  a floating button (mobile). The voice sheet shows listening, interim,
  processing and reply states, and closes with Escape.
- [ ] AC-V4: After a spoken nudge, the transcripts "yes", "yeah", "sure" and
  "add it" accept it (same effect as tapping Add), and "no" / "no thanks"
  dismiss it. Anything else is sent as a normal turn. The window ends after
  one utterance.
- [ ] AC-V5: Browsers without speech support get no mic button, and every
  voice path has a touch or text equivalent (ADR-0023 rule 11 kept).
- [ ] AC-V6: The ADR-0023 disclosure, tap-to-talk, the 15 s cap, barge-in and
  the stale-event guards are unchanged (existing voice tests pass).

### Repository
- [ ] AC-R1: `pnpm turbo run typecheck lint test build`, `pnpm --filter
  commerce-api test:db`, and ai-service's `ruff` / `mypy` / `pytest` all PASS.
- [ ] AC-R2: New ADRs are recorded: nudge architecture, the voice-first
  shell, and the theme/brand decision. `docs/development/getting-started.md`
  and `docs/api/*.md` are updated.

## Open questions

See `plan.md` § Open questions (OQ1–OQ8). Each has a recommendation. Reply
"approved" to accept them all as recommended.
