# Standard Path

**Risk: MEDIUM.** The default for real features and business logic.

```text
Inspect → /plan → Human Approval → /implement → /validate → /review
```

## When it applies

- New features of ordinary scope.
- Business logic changes.
- Work spanning a few modules.
- Additive API changes.
- Non-trivial bug fixes where the cause is not yet understood.

## Steps

| # | Step | Command | Produces |
| - | ---- | ------- | -------- |
| 1 | Inspect | — | which files and patterns are involved |
| 2 | Plan | `/plan <feature>` | `requirements.md`, `plan.md`, `test-plan.md` |
| 3 | **Approve** | human | `Approval Status: APPROVED` |
| 4 | Implement | `/implement <feature>` | one phase at a time |
| 5 | Validate | `/validate` | the results table |
| 6 | Review | `/review <feature>` | findings by severity |

Repeat steps 4–5 per phase.

## Approval

**Mandatory before step 4.** `/plan` writes documents and stops. `/implement`
refuses to start without recorded or in-conversation approval.

Approving means you read `requirements.md` and `plan.md` and agree with the
acceptance criteria, the phases, and the out-of-scope list.

## Validation expectations

- Targeted after each phase.
- Full run before review.
- Every status accurate (`.claude/rules/validation.md`).

## Review expectations

`/review` covers scope, acceptance criteria, correctness, error handling,
tests, conventions, and — where relevant — security and performance. Findings
are reported, not silently fixed. `BLOCKER` and `HIGH` must be resolved.

## Exit conditions

- All phases implemented.
- Full validation run and reported.
- No unresolved `BLOCKER` or `HIGH` findings.
- Scope matches the approved plan.
- Nothing committed, pushed, merged, or deployed.

`/final-review` and `/prepare-pr` are optional here — use them when the change
is going to a PR that others will review.

## Escalate to the Full Path when

- Implementation reveals a security, data, or infrastructure dimension.
- The plan needs to grow substantially.
- The change becomes hard to reverse.

Stop and re-run `/forge`.
