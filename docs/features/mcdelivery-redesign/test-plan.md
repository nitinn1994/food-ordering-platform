# Test Plan — McDelivery-style redesign, nudge architecture, voice-first AI

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC-U1 tokens | `globals.css` token presence test; `grep -rnE '#(DA0005\|FFBC0B)' apps/web/src --include=*.module.css` returns nothing | automated + manual grep |
| AC-U2 layout | component tests for region landmarks; manual check at 1366px and 375px with DevTools device emulation | automated + manual |
| AC-U3 card anatomy | `MenuItemCard.test.tsx`: marker, badge, price, Add, allergens, weight/kcal, missing-field fallbacks | automated |
| AC-U4 rail + chips | `CategoryFilter.test.tsx` (`aria-pressed` toggle group, thumbnails), `MenuList.test.tsx` (featured / veg filters) | automated |
| AC-U5 INR | `money.test.ts`; cart, checkout and confirmation tests assert `₹` | automated |
| AC-U6 no brand assets | manual review of `public/` and a grep for "McDonald", "McMuffin", "Speedee" in `apps/` | manual |
| AC-U7 no regressions | full `web` suite; changed tests listed in the implementation report | automated |
| AC-U8 contrast / focus | Lighthouse accessibility audit (chrome-devtools) on `/`, `/cart`, `/checkout`; keyboard walk-through | manual |
| AC-M1 migration | DB suite: migrate up, down, up again; no-op second run | automated (`test:db`) |
| AC-M2 seed + API | DB suite seed idempotency; menu e2e validates `menuResponseSchema` | automated |
| AC-M3 ai-service models | pytest for generated models + `get_menu` tool | automated |
| AC-M4 optional fields | contract tests with nulls; card fallback test | automated |
| AC-N1–N3 engine | unit tests per rule and guardrail (empty cart, main-only, item already in cart, unavailable item, one per surface) | automated |
| AC-N4 validation | HTTP e2e: bad `surface`, bad `itemId` → 400 error model | automated |
| AC-N5 session guardrails | `nudgeSession.test.ts` (cap 3, once per item, dismissal), copy snapshot has no urgency terms | automated |
| AC-N6 accept path | `NudgeCard.test.tsx` with stubbed fetch: POST `/v1/cart/items`, then cart re-read | automated |
| AC-V1 ShowNudge | contract tests; `dispatch.test.ts` ignores an unknown `nudgeId` | automated |
| AC-V2 AI tool | pytest: allowlist, read-only, commerce client call, simulated reply ≤1 suggestion + command | automated |
| AC-V3 voice shell | `VoiceSheet.test.tsx`, `VoiceLauncher.test.tsx` with the fake STT/TTS; Escape closes | automated |
| AC-V4 yes/no | `nudgeReply.test.ts` word list; reducer test for the 1-utterance window; integration test yes → add | automated |
| AC-V5 unsupported | test with no `SpeechRecognition`: no mic button, hint shown | automated |
| AC-V6 ADR-0023 kept | existing voice tests unchanged and passing | automated |
| AC-R1 | commands below | automated |
| AC-R2 docs | review | manual |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| token + layout tests | AC-U1, U2 | `apps/web/src/app/*.test.tsx`, `components/home/*.test.tsx` |
| card, rail, list, cart tests (updated) | AC-U3, U4, U7 | `apps/web/src/components/{menu,cart}/*.test.tsx` |
| money | AC-U5 | `apps/web/src/lib/money.test.ts` |
| menu contract tests | AC-M2, M4 | `packages/contracts/api-contracts/src/menu.test.ts` |
| nudge contract tests | AC-N4 | `packages/contracts/api-contracts/src/nudge.test.ts` |
| ShowNudge contract | AC-V1 | `packages/contracts/ui-commands/src/commands.test.ts` |
| migration / seed / repo | AC-M1, M2 | `apps/commerce-api/**/*.db.test.ts` |
| nudge rules + engine + e2e | AC-N1–N4 | `apps/commerce-api/src/modules/nudges/**/*.test.ts`, `test/` |
| nudge web | AC-N5, N6 | `apps/web/src/lib/nudges/*.test.ts`, `components/nudges/*.test.tsx` |
| dispatcher | AC-V1 | `apps/web/src/lib/commands/dispatch.test.ts` |
| ai-service tool + model | AC-M3, V2 | `apps/ai-service/tests/` |
| voice shell + reducer | AC-V3–V6 | `apps/web/src/components/voice/*.test.tsx`, `lib/voice/voiceReducer.test.ts` |

## Validation commands

Declared in the root `package.json` / `turbo.json`, `apps/commerce-api/package.json`,
`.github/workflows/ci.yml` and `docs/development/getting-started.md`.

| Check  | Command | Expected |
| ------ | ------- | -------- |
| format (TS) | NOT_CONFIGURED: no Prettier/format script is declared | n/a |
| format (Python) | `cd apps/ai-service && uv run ruff format --check .` | PASS |
| lint | `pnpm turbo run lint`; `cd apps/ai-service && uv run ruff check .` | PASS |
| types | `pnpm turbo run typecheck`; `cd apps/ai-service && uv run mypy` | PASS |
| test | `pnpm turbo run test`; `cd apps/ai-service && uv run pytest` | PASS |
| test (DB) | `pnpm --filter commerce-api db:up` then `pnpm --filter commerce-api test:db` | PASS |
| build | `pnpm turbo run build` (regenerates contract JSON Schema) | PASS |
| migrate | `pnpm --filter commerce-api db:migrate` / `db:migrate:down` | applies / reverts `0002` |

Between phases, only the touched packages' checks run (targeted, reported as
such). The full set runs before `/review`.

## Manual checks

1. Start the database, commerce-api, ai-service and web (getting-started.md).
   Re-run `db:migrate` and `db:seed`.
2. At 1366px, compare `/` against the reference captured in
   `requirements.md`: header, hero, band, rail, grid, sticky cart.
3. At 375px: category scroller, single column, bottom cart bar, no
   horizontal scroll.
4. Add a burger: a post-add toast suggests a side. Tap Add and the cart
   updates from the server. Dismiss another nudge and confirm it does not
   return in the session.
5. Voice (Chromium): tap the mic, say "add a burger", and hear the reply with
   one suggestion. Say "yes": the side is added and the cart re-reads. Repeat
   and say "no": the nudge is dismissed.
6. Firefox (no `SpeechRecognition`): no mic, text works.
7. Lighthouse accessibility audit on `/`, `/cart`, `/checkout`, and a
   keyboard-only pass.
8. Confirm the web proxy still blocks traversal paths with a live probe (per
   project memory: unit tests missed a Phase 15 regression). Grep the page
   body, not only the status code.

## Not covered

- Pixel-level visual diffing against the reference site: no visual
  regression tool is configured, and the goal is resemblance, not a clone.
- Real speech recognition accuracy for "yes"/"no": it depends on the browser
  vendor's engine. Tests use the fake STT.
- Nudge effectiveness (conversion): there is no analytics in scope.
- CI on GitHub: `ci.yml` has not yet run remotely (getting-started.md). Only
  local runs will be reported.
