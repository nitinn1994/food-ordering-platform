# Test Plan — Phase 7: Menu Domain & Menu API

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC1 — `GET /v1/menu` | e2e: 200, parse with `menuResponseSchema`, category/item ids in fixture order | automated |
| AC2 — item reads | e2e: `tiramisu` 200 parses with `menuItemResponseSchema`; `gelato` `available: false` | automated |
| AC3 — unknown item | e2e: 404, `contractErrorSchema` parse, `code` `MENU_ITEM_NOT_FOUND`, both id headers | automated |
| AC4 — malformed id | e2e: `Bad_ID` and a 65-char id → 400 `INVALID_PAYLOAD`, `field: "itemId"`, raw body lacks the value, controller spy not called | automated |
| AC5 — layering | Service test with a fake `MenuRepository`; module DI test; reading the controller; `grep` that only `infrastructure/` imports the seed | automated + manual |
| AC6 — seed invariants | Unit: duplicate category id, duplicate item id, mismatched `categoryId` each throw | automated |
| AC7 — immutability | Unit: mutating returned category/item throws in strict mode | automated |
| AC8 — contracts package | Schema tests + drift test; `git status` shows no change in the three existing contracts packages | automated + manual |
| AC9 — nothing extra | e2e: `/v1/menu/categories` → 404; inspect `package.json` and `src/` tree | automated + manual |
| AC10 — workspace green | `pnpm turbo run lint typecheck test build`; per-package counts vs 43 / 33 / 31 / 174 / 48 | automated |
| AC11 — runtime | `curl -i` against `dev` and built `start` for 200 / 400 / 404 / 404-route | manual (commands recorded) |
| AC12 — docs | Read each updated document | manual |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| Menu schemas accept/reject | AC8 | `packages/contracts/api-contracts/src/menu.test.ts` |
| JSON Schema drift | AC8 | `packages/contracts/api-contracts/src/schema.test.ts` |
| Invariants | AC6 | `apps/commerce-api/src/modules/menu/domain/menu.invariants.test.ts` |
| In-memory repository + seed | AC6, AC7 | `apps/commerce-api/src/modules/menu/infrastructure/in-memory-menu.repository.test.ts` |
| Service with fake repository | AC5 | `apps/commerce-api/src/modules/menu/menu.service.test.ts` |
| Module DI | AC5 | `apps/commerce-api/src/modules/menu/menu.module.test.ts` |
| Filter `DomainError` branch | AC3 | `apps/commerce-api/src/common/errors/all-exceptions.filter.test.ts` (added cases only; existing cases unchanged) |
| Real HTTP | AC1–AC4, AC9 | `apps/commerce-api/test/menu.e2e.test.ts` |

## Validation commands

Declared in root `package.json`, package scripts, and
`docs/development/getting-started.md`.

| Check | Command | Expected |
| ----- | ------- | -------- |
| format | — | NOT_CONFIGURED |
| lint | `pnpm turbo run lint` | PASS |
| types | `pnpm turbo run typecheck` | PASS |
| test | `pnpm turbo run test` | PASS |
| build | `pnpm turbo run build` | PASS |
| targeted | `pnpm --filter @contracts/api-contracts <build\|test\|lint\|typecheck>`, `pnpm --filter commerce-api <test\|lint\|typecheck>` | PASS |
| CI | — | NOT_CONFIGURED |

## Manual checks

1. `pnpm --filter commerce-api dev`, then:
   `curl -i http://127.0.0.1:3001/v1/menu`,
   `curl -i http://127.0.0.1:3001/v1/menu/items/tiramisu`,
   `curl -i http://127.0.0.1:3001/v1/menu/items/nope`,
   `curl -i http://127.0.0.1:3001/v1/menu/items/Bad_ID`,
   `curl -i http://127.0.0.1:3001/menu`.
2. Same against `pnpm --filter commerce-api build && pnpm --filter commerce-api start`.

## Not covered

- `apps/web` consuming the API — not wired this phase (OD8).
- Pydantic generation from `menu.v1.json` — `apps/ai-service` does not exist.
- Browser checks — `NOT_APPLICABLE`, no UI change.
