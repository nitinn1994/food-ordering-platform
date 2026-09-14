# Food Ordering — Frontend MVP

**Status:** Sections 1–8 (the original MVP) are implemented — Phase 1, fully
delivered. Section 9 (Phase 2 additions) is approved and in progress.
**Last updated:** 2026-09-14 (sub-phase 2.1)
**Related:** [`system-architecture.md`](../architecture/system-architecture.md) ·
[`phase-0-discovery.md`](../architecture/phase-0-discovery.md) ·
[`architecture-decisions.md`](../architecture/architecture-decisions.md)

> This document derives the MVP scope from `CLAUDE.md`. `CLAUDE.md` remains the
> specification of record; where the two disagree, `CLAUDE.md` wins and this
> file is wrong.

---

## 1. Goal

Prove the **UI command pipeline** — the riskiest cross-cutting mechanism in the
system — with the smallest possible surface, before any real backend, AI model,
or voice provider exists.

Everything else in the MVP exists to make that pipeline observable.

## 2. Why frontend-first

`CLAUDE.md` states the first milestone is frontend-first and simulation-first.
The reasoning worth restating: the boundary most likely to be got wrong is the
one where untrusted agent output meets the rendered UI. Building the backend
first would leave that boundary untested until late, when it is expensive to
change. Building the frontend against simulated commands tests it on day one.

## 3. In scope

| # | Capability | Notes |
| - | ---------- | ----- |
| 1 | Browse a simulated menu | Local fixture data in `apps/web`. No backend call. Clearly marked as fixture, in one module, easy to delete. |
| 2 | Add and remove cart items by touch | Cart state is local and **explicitly temporary** — it moves to `commerce-api` the moment that service exists. Documented as throwaway so nobody builds on it. |
| 3 | View a cart with line items and a total | Total computed locally *only because there is no backend yet*. This is the one place the MVP knowingly violates the authority model, and it must carry a comment saying so. |
| 4 | Text chat input | Produces simulated, hardcoded command sequences. No AI, no network call. |
| 5 | Validated UI command execution | The real deliverable. Commands are parsed against a Zod discriminated union from `packages/contracts/ui-commands`; unknown types are dropped and logged, never rendered. |
| 6 | A visible log of accepted and rejected commands | A development-only panel. Makes the allowlist's behaviour observable, which is what turns this from a claim into a demonstration. |

Minimum viable command set for #5 — three is enough to prove the pattern:
`ShowMenuCategory`, `HighlightItem`, `OpenCartPanel`.

## 4. Out of scope

Explicitly deferred, per `CLAUDE.md`:

- Real AI model integration — chat responses are hardcoded.
- Real voice provider, and any voice surface at all (ADR-0007).
- Real payments, and any checkout flow.
- Production authentication — single-user assumption.
- `apps/commerce-api` and `apps/ai-service` — neither is created in this MVP.
- Any database, real or simulated-behind-an-API.
- Docker, Kubernetes, deployment, tracing, multi-region.
- `agent-intents` and `api-contracts` schemas — no consumer exists yet, so
  writing them would mean guessing at interfaces.

## 5. User journeys

**Touch:** open the app → see the menu → tap an item → see it in the cart with
an updated total → remove it → total updates.

**Text:** type "show me the desserts" → a hardcoded `ShowMenuCategory` command
is produced → validated → the menu filters to desserts → the command appears in
the development log as accepted.

**Adversarial (the one that matters):** a deliberately malformed or
unrecognised command is injected → it is rejected → nothing renders → the
rejection appears in the development log. This journey is the MVP's actual
acceptance test.

## 6. Acceptance criteria

Written so each can be answered yes or no:

1. The menu renders from fixture data with no network request.
2. Tapping an item adds it to the cart; the line item and total both update.
3. A valid `ShowMenuCategory` command filters the menu to that category.
4. A command with an unrecognised `type` is not rendered, and is recorded as
   rejected in the development log.
5. A command with a recognised `type` but a malformed payload is rejected, not
   partially applied.
6. No code path in `apps/web` calls `eval`, `new Function`, or passes
   command-derived content to `dangerouslySetInnerHTML`.
7. `packages/contracts/ui-commands` is importable by `apps/web` through the
   workspace, not by relative path.

Criterion 4 and 5 are the ones worth failing the phase over.

## 7. Explicitly temporary

Three things in this MVP are scaffolding to be deleted, and each must say so in
its own source file:

1. Fixture menu data → replaced by `commerce-api` menu reads.
2. Client-side cart state → replaced by `commerce-api` cart ownership.
3. Client-side total calculation → replaced by backend-authoritative pricing.

The risk this section exists to manage: temporary state that stops being
temporary. Item 3 in particular contradicts the authority model, and the longer
it lives the more code depends on the client knowing how to price things.

## 8. Open product questions

1. **Menu shape.** Categories, modifiers, variants, combos? The fixture's
   shape becomes the de facto contract for the real menu API, so this is worth
   ten minutes now rather than a migration later.
2. **What does the chat do when it does not understand?** Even hardcoded, the
   MVP needs an answer, because "the agent produced nothing usable" is the
   common case in production and the UI should already have a shape for it.
3. **Does the development command log ship?** Useful in demos, and a plausible
   debugging surface later. If it ships, it needs a real home rather than being
   quietly promoted from a dev tool.

## 9. Phase 2 additions

Sections 1–8 above are the delivered Phase 1 MVP, left as written for the
historical record. This section layers Phase 2's approved scope on top —
see `docs/features/phase-2-menu-browsing/` for the full plan.

**Added to in-scope:**

- Search/filter within the existing menu (category + text query, AND
  semantics).
- An inline (non-modal) item detail panel, reachable by touch and by two new
  UI commands: `ShowItemDetail`, `SearchMenu`.
- Richer, **display-only** fixture fields (dietary tags, allergens, calories,
  longer description) — not price-affecting, so the pricing violation in §7
  does not grow.
- Real loading and error states, via an async `getMenu()` seam that becomes
  the single point `commerce-api` integration will later change.

**Explicitly declined, not deferred:** restaurant discovery, or any
`Restaurant` entity. See
[ADR-0009](../architecture/architecture-decisions.md#adr-0009--single-restaurant-scope-no-restaurant-entity)
— this was a live proposal for Phase 2 that was rejected because no approved
document ever specified it, and because it would silently turn a
single-restaurant ordering app into a marketplace.

**Still out of scope**, unchanged from §4: modifiers/variants/combos (would
compound the §7 pricing violation), routing/deep links, and everything on
the backend/AI/voice/payments/infra list.
