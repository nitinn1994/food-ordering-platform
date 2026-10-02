# Plan — McDelivery-style redesign, nudge architecture, voice-first AI

**Approval Status:** APPROVED (2026-09-27, OQ1–OQ8 as recommended). Scope approved for implementation: Phases 1–2 (Feature A). Phases 3–5: APPROVED 2026-10-01 (re-confirmed after the Phases 1–2 review, OQ8 a).

## Approach

Five phases. Each one is reviewable and leaves the repository green on its
own. The work extends what already exists rather than building beside it:

- **Theme**: CSS custom properties in `apps/web/src/app/globals.css`, consumed
  by the existing per-component CSS modules. No Tailwind and no UI library,
  so there is no new dependency.
- **Menu data**: a second Kysely migration and seed change behind the
  existing `MenuRepository` port (ADR-0017). Contract fields are added in
  `@contracts/api-contracts`, and JSON Schema and ai-service models are
  regenerated with the existing scripts (ADR-0012, ADR-0021).
- **Nudges**: a new commerce-api module in the same `domain/ application/
  infrastructure/` layout as `menu`, `cart` and `order`. It reads the cart
  and menu through their ports and never writes.
- **AI**: one more allowlisted read tool (ADR-0021 registry) and one more
  presentation UI command (ADR-0022). The graph and simulated model are
  extended, not restructured.
- **Voice-first**: a new shell around the existing `useAgentTurn` and the
  Phase 16 voice adapters and reducer (ADR-0023). There is still one turn
  path and no voice route.

### Nudge pattern architecture

```text
 trigger (web)            commerce-api  /v1/nudges                     delivery (web)
 ─────────────            ─────────────────────────────────────        ───────────────
 cart changed      ──┐    1 context   = server cart + menu + surface   cart panel card
 item added        ──┼──▶ 2 candidates= rules.evaluate(context)   ──▶  post-add toast
 item detail open  ──┤    3 eligible  = available ∧ ¬inCart            item detail row
 voice turn (tool) ──┘    4 guardrail = 1/surface, no checkout         spoken sentence
                          5 rank      = rule priority, then position   (ShowNudge cmd)
                          → Nudge { id, kind, surface, itemId,
                                    headline, priceCents }

 session policy (web, presentation only): ≤3 shown/session, 1×/item,
 dismissed → hidden for session.  Accept = existing POST /v1/cart/items.
```

- **Rule** (code-defined, typed, unit-tested):
  `{ id, kind: complete_meal | pairing | time_of_day | new_launch, priority,
  when(ctx) → boolean, suggest(ctx) → itemId[] , headline(item) }`.
  The starter rules are: main without side → side; main or side without drink
  → drink; meal without dessert and subtotal ≥ threshold → dessert; morning
  hours → breakfast category; `new_launch` spotlight on an empty cart
  (`item_detail` only).
- **Nudge id** = `rule:<ruleId>:<itemId>`. It is deterministic, so the web
  can check that `ShowNudge.nudgeId` refers to a nudge it actually fetched.
- **Ethics guardrails** are acceptance criteria, not guidelines (AC-N5): no
  pre-added items, no urgency or scarcity copy, always dismissible, capped.

### Voice-first flow

```text
 mic (header / FAB) → VoiceSheet[listening] → final transcript
   ├─ pendingSpokenNudge ∧ transcript ∈ {yes, sure, add it…} → accept nudge (POST cart) → re-read cart
   ├─ pendingSpokenNudge ∧ transcript ∈ {no, no thanks}      → dismiss nudge
   └─ otherwise → useAgentTurn.submit(transcript)            → reply + uiCommands (incl. ShowNudge)
                                                             → speak reply (ADR-0023 rule 6)
                                                             → if ShowNudge: pendingSpokenNudge = id (1 utterance window)
```

The yes/no resolver is a closed word list. It maps a transcript onto an
existing *user action* (tap Add or Dismiss), so it is neither free-form NLU
in the frontend nor AI-driven state mutation. The confirmed cart still comes
from commerce-api.

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| **apps/web** | | |
| `src/app/globals.css` | modified | design tokens, base type, `color-scheme: light` |
| `src/app/layout.tsx`, `page.tsx`, `page.module.css` | modified | new shell: header, hero, menu band, three columns |
| `src/components/nav/SiteNav.*` | modified | sticky header: placeholder logo, mode pill, location pill, mic, cart |
| `src/components/home/HeroBanner.*`, `MenuBand.*` | new | hero and "Our Menu" chips + search wrapper |
| `src/components/menu/CategoryFilter.*` | modified | vertical rail with thumbnails / mobile scroller |
| `src/components/menu/MenuList.*`, `MenuItemCard.*`, `ItemDetailPanel.*` | modified | card grid, new card anatomy, veg/featured filters |
| `src/components/cart/CartPanel.*`, `CartLine.*`, `QuantityStepper.*` | modified | sticky cart card, empty state, mobile bottom bar |
| `src/components/checkout/*.module.css` | modified | restyle only |
| `src/components/nudges/NudgeCard.*`, `NudgeToast.*` | new | nudge surfaces |
| `src/lib/nudges/` (`nudgeSource.ts`, `nudgeSession.ts`, `nudgeReply.ts`) | new | fetch, session caps and dismissals, yes/no resolver |
| `src/components/voice/VoiceSheet.*`, `VoiceLauncher.*` | new | voice-first surfaces around the existing `VoiceControl` logic |
| `src/lib/voice/voiceReducer.ts` | modified | `pendingSpokenNudge` state (1-utterance window) |
| `src/lib/commands/dispatch.ts` | modified | handle `ShowNudge` |
| `src/lib/money.ts` | modified | INR / `en-IN` |
| `public/brand/*`, `public/menu/*` | new | original placeholder logo and SVG item illustrations |
| co-located `*.test.tsx` / `*.test.ts` | new / modified | see test-plan |
| **packages/contracts** | | |
| `api-contracts/src/menu.ts` | modified | `imageUrl`, `weightGrams`, `badge`, `featured[]`, category `imageUrl` |
| `api-contracts/src/nudge.ts` (+ index, schema) | new | `nudgeSchema`, `nudgesQuerySchema`, `nudgesResponseSchema` |
| `ui-commands/src/commands.ts` (+ schema) | modified | `ShowNudge` |
| **apps/commerce-api** | | |
| `src/database/migrations/0002_menu_presentation.ts` | new | new nullable columns + `featured text[]` default `{}` |
| `src/database/database.schema.ts` | modified | row types |
| `src/modules/menu/**` (types, repositories, `menu.seed.ts`) | modified | map new fields; new generic INR seed |
| `src/modules/nudges/**` | new | rules, engine, service, controller, module |
| `src/app.module.ts` (or equivalent root module) | modified | register `NudgesModule` |
| **apps/ai-service** | | |
| `ai_service/contracts/` (generated models) | regenerated | menu + nudge models |
| `ai_service/clients/commerce/` | modified | `get_nudges()` |
| `ai_service/tools/registry.py` (+ tool module) | modified | `get_nudges` read tool |
| `ai_service/ui_commands/registry.py` | modified | `show_nudge` presentation tool |
| `ai_service/llm/simulated.py` | modified | after `add <item>`: call `get_nudges`, append one suggestion, emit `ShowNudge` |
| **docs** | | |
| `docs/architecture/architecture-decisions.md` | modified | ADR-0025 theme/brand, ADR-0026 nudges, ADR-0027 voice-first shell |
| `docs/api/commerce-api.md`, `ai-service.md`, `contracts.md` | modified | new endpoint, tool, command |
| `docs/development/getting-started.md` | modified | re-seed note, test counts |

Exact file names inside existing modules are confirmed at the start of each
phase. The table names the area, and a new file created beyond it is
reported.

## Phases

### Phase 1 — Design tokens and visual shell (apps/web only)
- [ ] Tokens in `globals.css`. Placeholder brand (logo SVG + name, OQ1). Font stack (OQ6).
- [ ] Header, hero banner (static slides, no carousel library), "Our Menu" band with chips + search.
- [ ] Three-column layout with a sticky cart. Mobile breakpoints and bottom cart bar.
- [ ] Card, rail and cart restyle against the **current** menu fields (images fall back to category illustrations). Checkout restyle.
- [ ] INR formatting (OQ3). Update tests broken only by markup changes.
- **Done when:** AC-U1–U8 hold against the existing 6-item menu. Web typecheck, lint, test and build PASS.

### Phase 2 — Menu presentation data (contracts, commerce-api, ai-service models)
- [ ] `menu.ts` contract fields. Regenerate JSON Schema.
- [ ] Migration `0002` + schema types + repository mapping (Postgres and in-memory adapters).
- [ ] New seed (about 8 generic categories, about 30 items, INR, placeholder images). Seed idempotency kept.
- [ ] Regenerate ai-service models. The web card shows the new fields and filters.
- **Done when:** AC-M1–M4 hold and AC-U3/U4 hold with real data. `test`, `test:db` and ai-service checks PASS.

### Phase 3 — Nudge engine and endpoint (contracts, commerce-api)
- [ ] `nudge.ts` contract. `NudgesModule` (rules, engine, service, controller). `GET /v1/nudges`.
- [ ] Unit tests per rule and guardrail. HTTP e2e test on the in-memory adapters. One DB-suite test.
- **Done when:** AC-N1–N4 hold. commerce-api test + test:db PASS.

### Phase 4 — Nudge surfaces in the web + AI integration
- [ ] Web: `nudgeSource`, `nudgeSession` caps and dismissals, `NudgeCard` (cart, item detail), `NudgeToast` (post-add). Accept via the existing cart add path.
- [ ] Contracts: `ShowNudge`. Web dispatcher checks it against fetched nudges.
- [ ] ai-service: `get_nudges` client + tool, `show_nudge` presentation tool, simulated model follow-up.
- **Done when:** AC-N5, AC-N6, AC-V1 and AC-V2 hold. All TS and Python checks PASS.

### Phase 5 — Voice-first shell
- [ ] `VoiceLauncher` (header + mobile FAB), `VoiceSheet` (states, interim text, suggested prompts, Escape).
- [ ] First-visit prompt, shown after the ADR-0023 disclosure.
- [ ] `pendingSpokenNudge` in the reducer + `nudgeReply` yes/no resolver.
- [ ] ADRs 0025–0027. API docs and getting-started updated.
- **Done when:** AC-V3–V6, AC-R1 and AC-R2 hold.

**Phase 2 scope change (approved 2026-09-27, option A):** the plan assumed
the seed could simply be replaced, but `MENU_SEED` is also the DB-free test
menu (~30 commerce-api and ~12 ai-service test files use its ids and prices),
and the seed never deletes rows. So `MENU_SEED` stays as the test menu (new
fields absent); a new `DEMO_MENU_SEED` is what `db:seed` loads; the new
contract fields are optional; existing local databases need a one-time reset
(`docker compose -f infrastructure/docker/compose.yaml down -v`, then
`db:up`, `db:migrate`, `db:seed`).

**Split recommendation:** this is at the ~5-phase limit, so it is really two
features. **Feature A** is Phases 1–2 (theme + menu data), which has
standalone value and the lower risk. **Feature B** is Phases 3–5 (nudges +
voice-first). I recommend approving A now and re-confirming B once A is
reviewed (OQ8).

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| Trade-dress / trademark infringement from an "identical" copy | legal | Layout and colour feel only. No logos, font, product names or photos (OQ1, AC-U6). |
| `strictObject` contracts reject new menu fields in un-updated consumers | runtime failures between services | Contract, commerce-api, web and ai-service models change in the same phase (Phase 2). Round-trip tests. |
| Restyle breaks many web tests that query by structure or text | noisy diff, hidden regressions | Keep accessible names and roles stable, and list every changed test with the reason (AC-U7). |
| Nudges become dark patterns | user harm, trust | Guardrails are ACs (AC-N5). Rules live in code and are reviewed. No urgency copy. |
| Spoken "yes" mis-heard, adding an unwanted item | wrong cart | One-utterance window, closed word list, a visible toast with Undo (remove), and the cart is always re-read. |
| Voice-first UI crowds out users without speech support | accessibility | No mic without support. Every voice path has a touch equivalent (AC-V5). |
| Migration on existing local DBs | dev friction | `0002` is additive with nullable/default columns and a tested `down`. The seed upserts. |
| Scope creep into combos, modifiers, offers, location | schedule | Listed as out of scope. The header shows placeholders only. |

## Assumptions

- Verified: the web uses CSS modules and bare `globals.css` with no tokens and
  no Tailwind (`apps/web/src/app/globals.css`).
- Verified: the menu has no image, weight, badge or featured fields
  (`database.schema.ts`), and only migration `0001` exists.
- Verified: contracts use `z.strictObject` (`api-contracts/src/menu.ts`), and
  there are 5 UI command types (`ui-commands/src/commands.ts`).
- Verified: money is USD / `en-US` (`apps/web/src/lib/money.ts`).
- Verified: ai-service has no conversation memory (ADR-0020), which is why
  yes/no is resolved in the web against a pending nudge rather than by the
  agent.
- Verified: no recommendation or upsell concept exists anywhere today.
- Not verified: the exact name of commerce-api's root module file and the
  ai-service model-generation script name. Both are confirmed in Phase 2/3
  before editing.
- Not verified: the reference site's mobile layout was not captured. The
  mobile design follows common QSR patterns and the desktop tokens.
- Not verified: placeholder SVG illustrations are acceptable in place of
  photos (OQ1).

## Open questions (recommendation first)

- **OQ1 Branding**: (a, recommended) original placeholder name and logo, and
  original SVG food illustrations. (b) You supply licensed assets. Using
  McDonald's own assets is not an option I will implement.
- **OQ2 Header extras** (location, "Now", Offers, Restaurants Nearby,
  account): (a, recommended) non-functional placeholders with
  `aria-disabled` and a "Coming soon" tooltip. (b) Omit them.
- **OQ3 Currency**: (a, recommended) INR / `en-IN` everywhere, matching the
  reference. The seed prices are re-authored in paise. (b) Keep USD.
- **OQ4 Nudge dismissals**: (a, recommended) per-session, client-side, no
  table. (b) Persist per owner in commerce-api, which adds a migration and
  makes data impact larger.
- **OQ5 Spoken yes/no**: (a, recommended) web-side closed-vocabulary resolver
  against a pending nudge (no agent memory needed). (b) Add optional
  `context.activeNudgeId` to the turn request and let ai-service handle it,
  which is a contract change and a stateful agent. (c) No spoken acceptance.
- **OQ6 Font**: (a, recommended) a heavy system-font stack, with no network
  or dependency. (b) An open Google font via `next/font/google` (fetched at
  build time, so it affects CI and Docker builds).
- **OQ7 Dark mode**: (a, recommended) light-only, like the reference. (b) Also
  design a dark theme.
- **OQ8 Split**: (a, recommended) approve Feature A (Phases 1–2) now and
  Feature B (3–5) after A's review. (b) Approve all five phases now.

## Not doing

- Combos, customisation or modifiers, offers, store locator, delivery slots,
  login.
- A real model, voice provider, wake word or continuous listening.
- Nudge analytics, experiments, personalisation.
- Refactoring unrelated web, commerce-api or ai-service code.

## Specialised review needed?

- security: **yes**. New public read endpoint (input validation, no cart
  leakage across owners), new UI command (must not execute unreferenced
  content), and a voice yes/no path that changes the cart.
- performance: **light**. `/v1/nudges` is called on each cart change, so debounce
  it in the web and confirm it reads cart and menu once per request. Check
  image weight on the home page.
- data / migration: **yes**. Migration `0002` up/down, and the seed rewrite on
  existing local databases.
- accessibility (added): **yes**. Contrast of yellow buttons and red badges,
  focus order across three columns, and voice sheet keyboard and screen-reader
  behaviour.
