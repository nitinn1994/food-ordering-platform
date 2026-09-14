# Test Plan — Phase 1: Next.js Frontend Foundation

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC1 — menu renders from fixtures, no network | Component test asserting menu items render; manual check of the Network panel | automated + manual |
| AC2 — tapping adds to cart, total updates | Component test on `cartStore` reducer + a render test | automated |
| AC3 — valid `ShowMenuCategory` filters the menu | Dispatch test: command in, `uiStore.selectedCategory` out | automated |
| AC4 — unknown `type` rejected and logged | `parseCommand` unit test + dispatch test asserting no state change | automated |
| AC5 — malformed payload rejected, not partially applied | `parseCommand` unit test with a valid `type` and a bad field | automated |
| AC6 — no `eval` / `new Function` / `dangerouslySetInnerHTML` | `grep` over `apps/web/src` in the phase report; ESLint rule where available | automated + manual |
| AC7 — workspace import, not relative path | Build succeeds with `@contracts/ui-commands`; grep for `../../packages` finds nothing | automated |
| AC8 — `dispatch.ts` does not import `cartStore` | Unit test reading the module source and asserting the import is absent | automated |
| AC9 — typecheck, lint, test, build all exit 0 | The four commands below | automated |
| AC10 — `getting-started.md` has real commands | Manual read against the actual `package.json` scripts | manual |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| accepts a valid command of each of the three types | AC3 | `packages/contracts/ui-commands/src/commands.test.ts` |
| rejects an unrecognised `type` | AC4 | `packages/contracts/ui-commands/src/commands.test.ts` |
| rejects a recognised `type` with a malformed payload | AC5 | `packages/contracts/ui-commands/src/commands.test.ts` |
| `parseCommand` never throws on arbitrary input | AC4, AC5 | `packages/contracts/ui-commands/src/commands.test.ts` |
| rejected commands produce no UI state change | AC4 | `apps/web/src/lib/commands/dispatch.test.ts` |
| `ShowMenuCategory` sets the selected category | AC3 | `apps/web/src/lib/commands/dispatch.test.ts` |
| `dispatch.ts` source contains no `cartStore` import | AC8 | `apps/web/src/lib/commands/dispatch.test.ts` |
| cart add / remove updates lines and total | AC2 | `apps/web/src/lib/state/cartStore.test.ts` |
| integer-cents formatting has no float drift | AC2 | `apps/web/src/lib/money.test.ts` |

## Validation commands

These **do not exist yet** — Phase 1.1 creates them. Until then every row is
`NOT_CONFIGURED`, per `.claude/rules/validation.md`.

| Check  | Command | Expected |
| ------ | ------- | -------- |
| format | — | `NOT_CONFIGURED` (no formatter this phase) |
| lint   | `pnpm turbo run lint` | PASS |
| types  | `pnpm turbo run typecheck` | PASS |
| test   | `pnpm turbo run test` | PASS |
| build  | `pnpm turbo run build` | PASS |

Targeted runs between sub-phases; the full set before `/review`.

## Manual checks

1. `pnpm --filter web dev`, open the app, confirm the menu renders.
2. Open DevTools Network; confirm no request is made for menu data (AC1).
3. Tap an item; confirm it appears in the cart and the total updates (AC2).
4. Type "show me the desserts"; confirm the menu filters and the command
   appears in the dev log as accepted (AC3).
5. Trigger the injected bad command; confirm nothing renders and the rejection
   appears in the dev log (AC4).
6. Read `getting-started.md` against `package.json`; confirm every listed
   command exists and every existing command is listed (AC10).

## Not covered

- **No end-to-end browser automation.** Playwright would be the right tool, but
  adding it is a dependency and a CI decision this phase has not scoped. The
  manual checks above stand in; this is a real gap, not a solved problem.
- **No visual or accessibility testing.** Deferred until there is a UI worth
  regression-testing.
- **No test of the real agent → command path**, because no agent exists. The
  simulated commands exercise the same validation code, which is the part under
  test, but they do not prove a real model produces conformant output.
- **No cross-browser checks.** Local development only.
