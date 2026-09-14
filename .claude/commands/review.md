---
description: Review the current implementation against the approved plan. Reports findings; does not change code.
argument-hint: <feature-name>
---

# /review

## Purpose

Judge the work that exists against the plan that was approved.

## Rules

- **Report findings. Do not fix them in this command.** Silent fixes hide
  problems from the human.
- Read the plan before reading the diff. Code can only be judged against intent.

## Steps

1. **Read** `docs/features/<feature-name>/requirements.md` and `plan.md`, then
   the actual changes (`git diff` if this is a git repository, otherwise the
   files the implementation report listed).

2. **Check, in this order:**

   - **Scope** — does every changed file serve a phase of the plan? Anything
     unattributable is a finding, even if the code is good. See
     `.claude/rules/scope-control.md`.
   - **Requirements** — is each acceptance criterion actually satisfied by the
     code, not merely adjacent to it?
   - **Conventions** — does this match the project's existing patterns, or does
     it introduce a second way of doing something the project already does?
   - **Correctness** — logic, boundaries, empty/null cases, error paths.
   - **Error handling** — are failures handled, or swallowed? Are error
     messages useful?
   - **Tests** — do the new tests actually cover the acceptance criteria, or
     just the happy path?
   - **Maintainability** — naming, duplication, does it match the surrounding
     code's style?
   - **Security** — only when the change touches input handling, auth, secrets,
     file paths, or external calls.
   - **Performance** — only when the change touches a hot path, a loop over
     unbounded data, or a query.

3. **Report findings** by severity, using the template at
   `.claude/templates/review-report.md`:

   | Severity  | Meaning |
   | --------- | ------- |
   | `BLOCKER` | Wrong, unsafe, or breaks something. Must be fixed. |
   | `HIGH`    | Real defect or risk. Fix before merge. |
   | `MEDIUM`  | Should be fixed; the human may defer it. |
   | `LOW`     | Optional improvement. |
   | `NOTE`    | Observation only; no action implied. |

   Each finding: file and line, what is wrong, why it matters, and a suggested
   fix. If there are no findings, say so plainly — do not manufacture some.
   Severity reflects consequence, not confidence; if you are unsure a finding
   is real, say so in the finding rather than lowering its severity.

4. **State what you could not review** (files you did not read, behaviour you
   could not run).

## Extension point

On the Full Path, specialised review (security, performance, data/migration) is
flagged by `/plan` and performed by a human or a dedicated agent. Later this can
fan out to accessibility and reliability reviewers too. Today it is one reviewer
with a checklist, optionally assisted by the `implementation-reviewer` agent.
