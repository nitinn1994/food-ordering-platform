# Requirements — Phase 1: Next.js Frontend Foundation

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-14 (in conversation)
**Risk:** MEDIUM
**Path:** Standard

## Problem

The repository has no executable code. More importantly, the boundary Phase 0
identified as the riskiest in the system — untrusted agent output reaching the
renderer (`system-architecture.md` §4.3–4.4) — is currently a rule written in a
document and nothing else. Every later phase builds on top of that boundary, so
if it is wrong, it is wrong everywhere and expensive to correct.

## Goal

A running Next.js frontend in which a malformed or unrecognised command is
provably rejected before it can render, and in which a cart-mutating command
cannot be a UI command by construction.

## In scope

- Root pnpm + Turborepo workspace (ADR-0002), `.gitignore`, pinned Node.
- `packages/contracts/ui-commands` — Zod discriminated union (ADR-0003,
  TypeScript side only) with three display-only commands:
  `ShowMenuCategory`, `HighlightItem`, `OpenCartPanel`.
- `apps/web` — Next.js App Router + TypeScript, importing contracts through the
  workspace.
- Fixture menu, touch-driven cart, cart totals.
- Text chat input producing hardcoded command sequences.
- Development panel logging accepted and rejected commands.
- Vitest across the TypeScript graph; ESLint; typecheck.
- Update `docs/development/getting-started.md` with the real commands.

## Out of scope

- `apps/commerce-api`, `apps/ai-service` — neither created nor stubbed.
- Any database, real or simulated-behind-an-API.
- Real AI, real network calls, MSW or any API-mocking layer.
- Any voice surface, including a disabled control (ADR-0007).
- `agent-intents` and `api-contracts` schemas — no consumer exists.
- The Zod → JSON Schema → Pydantic codegen (ADR-0003) — no Python consumer yet.
- Payments, checkout, authentication, Docker, Kubernetes, CI configuration.
- The two `.claude/README.md` typos and the empty root `README.md`.

## Acceptance criteria

- [ ] AC1: The menu renders from fixture data with no network request.
- [ ] AC2: Tapping an item adds it to the cart; line item and total both update.
- [ ] AC3: A valid `ShowMenuCategory` command filters the menu to that category.
- [ ] AC4: A command with an unrecognised `type` is not rendered and is logged
      as rejected.
- [ ] AC5: A command with a recognised `type` but a malformed payload is
      rejected, not partially applied.
- [ ] AC6: No code path in `apps/web` calls `eval`, `new Function`, or passes
      command-derived content to `dangerouslySetInnerHTML`.
- [ ] AC7: `@contracts/ui-commands` is imported by `apps/web` through the
      workspace, not by a relative path.
- [ ] AC8: `dispatch.ts` does not import `cartStore` — asserted by a passing
      test.
- [ ] AC9: `pnpm turbo run typecheck`, `lint`, `test` and `build` all exit 0.
- [ ] AC10: `getting-started.md` lists the real commands, with no row still
      reading `NOT_CONFIGURED` for a command that now exists.

AC4, AC5 and AC8 are the criteria worth failing the phase over. The rest is a
menu.

## Decisions taken at approval

| # | Decision | Effect |
| - | -------- | ------ |
| A | Vitest across the whole TypeScript graph | **Revises ADR-0006**, which proposed Jest and was never binding |
| B | CSS Modules, not Tailwind | No new styling dependency this phase |
| C | PascalCase command discriminants — `type: "ShowMenuCategory"` | Resolves contradiction C2 from the Phase 0 review |

## Correction to the Phase 0 baseline

`phase-0-discovery.md:188` proposed the UI command set `show_menu`,
`add_to_cart`, `show_cart`. `add_to_cart` changes what the user is charged,
which by `system-architecture.md:127` makes it a business intent, not a UI
command. It is **not** implemented. The display-only set from
`food-ordering-frontend-mvp.md` is used instead. Approved in conversation on
2026-09-14.

## Open questions

- Whether the development command log ships beyond this phase
  (`food-ordering-frontend-mvp.md` §8.3). Built as dev-only for now.
- What the chat does with an utterance it cannot map to a command
  (`food-ordering-frontend-mvp.md` §8.2). Phase 1 answer: produce no command
  and show a fixed fallback message. Revisit when a real agent exists.
