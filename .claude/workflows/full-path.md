# Full Path

**Risk: HIGH.** For work where a mistake is expensive, public, or hard to undo.

```text
Inspect → Risk Assessment → /plan → Human Approval → /implement
       → /validate → Specialised Review (where relevant)
       → /final-review → /prepare-pr → human opens the PR
```

## When it applies

Any one of these is enough:

- Authentication or authorisation.
- Payments or billing.
- Database migrations, data deletion, or backfills.
- Personal or regulated data.
- Infrastructure, networking, or IAM.
- Security-sensitive logic.
- Breaking API changes.
- Major architectural changes.

## Steps

| # | Step | Command | Produces |
| - | ---- | ------- | -------- |
| 1 | Inspect | — | affected areas and blast radius |
| 2 | Risk assessment | `/forge` | risk level + the dimensions that set it |
| 3 | Plan | `/plan <feature>` | the three documents, incl. specialised-review flags |
| 4 | **Approve** | human | `Approval Status: APPROVED` |
| 5 | Implement | `/implement <feature>` | one phase at a time |
| 6 | Validate | `/validate` | full results table |
| 7 | Specialised review | human or agent | security / performance / data findings |
| 8 | Final review | `/final-review <feature>` | `READY_FOR_PR` or `NOT_READY_FOR_PR` |
| 9 | Prepare PR | `/prepare-pr <feature>` | `pr-description.md` |
| 10 | Open the PR | **human** | the PR |

## Risk assessment (step 2)

Beyond the classification table, record in `requirements.md`:

- **Blast radius** — who and what is affected if this is wrong.
- **Reversibility** — can it be reverted? If not, what is the recovery path?
- **Detection** — how would you find out it went wrong, and how fast?

If reversibility is poor and detection is slow, the plan needs a smaller first
phase.

## Approval

**Mandatory, and non-negotiable.** HIGH-risk work is never implemented straight
from `/forge`, no matter how small the diff looks.

Approve phase by phase where the risk warrants it, rather than once for the
whole plan.

## Validation expectations

Full runs, not targeted. Every claim carries a command and evidence. Use the
`validation-reviewer` agent to audit the evidence before step 8 — on this path,
an overstated `PASS` is the failure mode that matters most.

## Specialised review (step 7)

`/plan` flags which are needed. Today these are performed by a human, or by the
`implementation-reviewer` agent with a focused brief:

- **Security** — authn/authz paths, input trust boundaries, secrets, injection,
  session handling.
- **Performance** — queries, N+1s, unbounded loops, payload sizes.
- **Data / migration** — reversibility, data loss, ordering, partial-failure
  behaviour.

Dedicated reviewer agents are a planned extension, not a current feature.

## Review expectations

`/review` plus the specialised passes. All `BLOCKER` and `HIGH` findings
resolved before step 8 — no deferral.

## Exit conditions

- Every acceptance criterion verified with evidence.
- Full validation run; all claims audited.
- No unresolved `BLOCKER` or `HIGH` findings.
- `/final-review` returned `READY_FOR_PR`.
- `pr-description.md` written, separating executed from unexecuted checks.
- Working tree contains only expected changes.
- Nothing committed, pushed, merged, or deployed.

## De-escalate when

If assessment shows the change is genuinely lower risk than first classified —
say, a "migration" that only adds a nullable column — say so with reasoning and
ask the human to confirm dropping to the Standard Path. Do not drop silently.
