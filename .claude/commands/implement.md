---
description: Implement an approved plan, one phase at a time, without committing.
argument-hint: <feature-name> [phase-number]
---

# /implement

## Purpose

Build exactly what the approved plan describes.

## Preconditions

- `docs/features/<feature-name>/plan.md` exists.
- **The human approved it.** `requirements.md` reads `Approval Status: APPROVED`,
  or approval was given in this conversation. If neither is true, stop and ask.
  Do not implement on assumption.
- If no plan exists at all, the task should have gone through `/forge` first.
  Only the Quick Path may implement without a plan.

## Rules

- Read `.claude/rules/core.md` first.
- Do not commit, push, merge, or deploy.
- Do not implement anything the plan does not describe.

## Steps

1. **Re-read the plan** and the acceptance criteria in `requirements.md`.

2. **Re-inspect — narrowly.** Confirm the affected files still look the way the
   plan assumes. Re-read only those files and their direct neighbours; do not
   re-scan the repository. Reuse inspection context from this conversation
   where it is still reliable.

3. **Implement one phase.** Not the whole plan at once. Follow the existing
   architecture and the conventions of the files you are editing. **Reuse the
   project's existing utilities, helpers, and abstractions** — search for one
   before writing a new one.

4. **Validate what you can.** Run the checks relevant to this phase — targeted,
   not the full suite (see `.claude/rules/validation.md`). Say that the run was
   targeted. If a check cannot run, record why; do not skip silently.

5. **Stop on a blocker.** If the plan turns out to be wrong, a dependency is
   missing, or the change would grow beyond the plan, stop and report using the
   scope-change form in `.claude/rules/scope-control.md`. Do not improvise a
   bigger change.

6. **Report.** For the phase you completed:

   - Files created / modified / deleted.
   - What each change does, in one line.
   - Checks run and their results (PASS / FAIL / SKIPPED / NOT_CONFIGURED /
     NOT_APPLICABLE).
   - **Areas deliberately left unchanged**, where a reader might expect a change.
   - **What was not verified**, and **which assumptions are still unverified**.
   - Any `FOLLOW-UP (not done)` items discovered — recorded, not fixed.
   - Which phase is next.

   Then stop and let the human decide whether to continue.

## Extension point

Later this can enforce test-first phases, require a phase checklist in the
plan, or gate each phase on `/validate` passing. Today it is a discipline, not
an enforcement.
