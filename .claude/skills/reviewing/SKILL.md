---
name: reviewing
description: Use when reviewing an implementation - a consistent checklist, a severity model, and the discipline of reporting findings instead of silently fixing them. Applies to self-review and to reviewing another agent's work.
---

# Review

## Purpose

Find what is wrong before a human spends attention on it, and say so in a form
that can be acted on.

## When to use

After implementation, before `/final-review`. Also useful on your own work —
though self-review is weaker, so state when the reviewer wrote the code.

## Inputs

The approved plan, the acceptance criteria, and the actual changes.

## Procedure

**Read the plan before the diff.** Code can only be judged against intent.
A reviewer who reads the diff first ends up reviewing the code that exists
rather than the code that was needed.

Then check in this order — the cheapest disqualifiers first:

1. **Scope.** Map each changed file to a plan phase. Unattributable changes are
   findings even when the code is good.
2. **Acceptance criteria.** Each one: satisfied, or merely adjacent?
3. **Correctness.** Logic, boundaries, empty and null, error paths, resource
   cleanup, concurrency.
4. **Error handling.** Handled or swallowed? Is the message useful to whoever
   will read it at 3am?
5. **Tests.** Do they cover the criteria, or only the happy path? **Would they
   fail if the implementation were wrong?** An always-green test is worse than
   no test.
6. **Conventions.** Does this match existing patterns, or add a second way to
   do something the project already does one way?
7. **Security** — only where the change touches input trust boundaries, auth,
   secrets, file paths, deserialisation, or external calls.
8. **Performance** — only where it touches a hot path, an unbounded loop, or a
   query.

## Severity model

| Severity | Meaning | Blocks merge? |
| -------- | ------- | ------------- |
| `BLOCKER` | Wrong, unsafe, or breaks something. | Yes |
| `HIGH` | Real defect or risk. | Yes |
| `MEDIUM` | Should be fixed; human may defer. | No |
| `LOW` | Optional improvement. | No |
| `NOTE` | Observation; no action implied. | No |

Severity reflects **consequence, not confidence**. An unsure `BLOCKER` stays a
`BLOCKER` and says it is unsure. Downgrading uncertain findings is how real
defects get shipped.

## The discipline

- **Report; do not fix.** A silent fix during review hides the problem from the
  human and from the record.
- **No findings is a valid result.** Do not manufacture findings to look
  thorough — it trains people to ignore the review.
- **Say what you did not review** and why. Unstated gaps read as coverage.
- Review the code, not the author.

## Outputs

`.claude/templates/review-report.md` — verdict, findings table, scope table,
not-reviewed list.

## Limitations

- Reading code cannot prove behaviour. Where correctness depends on running it,
  say so and defer to `/validate`.
- Self-review catches less. On the Full Path, prefer the
  `implementation-reviewer` agent for a separate pass.

## Efficiency guidance

- Review the diff, not the repository.
- Do not re-derive what `/validate` already established — reference it.
- Group repeated instances of one problem into a single finding.
