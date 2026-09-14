---
name: planning
description: Use when writing a feature plan - turning a request into requirements, checkable acceptance criteria, affected files, small phases, risks, and a test plan. Covers how to write these well, not which command to run.
---

# Planning

## Purpose

Produce a plan a developer can disagree with. A plan that cannot be disagreed
with is not a plan, it is a summary.

## When to use

Any Standard or Full Path task, and any time a request is vague enough that
building the wrong thing is plausible.

## Inputs

The request, and enough inspection to know which files it touches.

## Procedure

1. **Separate problem from solution.** Write the problem first, without
   mentioning implementation. If you cannot, you do not understand it yet.

2. **Write acceptance criteria that can be answered yes or no.**

   | Bad | Good |
   | --- | ---- |
   | Login should work well | Invalid password returns 401 and no session cookie is set |
   | Handle errors properly | Network timeout shows a retry button; the form keeps its values |
   | Search should be fast | Search over 10k products returns in under 300ms locally |

   If a criterion cannot be checked, it cannot be reviewed, and `/final-review`
   will be unable to verify it.

3. **State what is out of scope**, explicitly. The out-of-scope list prevents
   more rework than the in-scope list.

4. **Identify affected files by looking**, not by guessing. Each entry says
   what changes and why.

5. **Phase the work so each phase leaves the repository working.** A phase is
   the right size when it can be reviewed in one sitting and described in one
   sentence. More than about five phases means this is two features — say so.

6. **Separate risks from assumptions.**
   - *Risk*: something that might go wrong. Needs a mitigation.
   - *Assumption*: something believed true but unverified. Needs checking, or
     an explicit note that it was not checked.

   Assumptions are the more dangerous category because they are invisible.

7. **Write open questions down** rather than resolving them silently. If an
   open question changes the design, ask before writing the plan.

8. **Plan the tests with the feature**, mapping each acceptance criterion to
   how it will be verified, and naming which are manual.

## Outputs

`requirements.md`, `plan.md`, `test-plan.md` from `.claude/templates/`, with
`Approval Status: PENDING`.

## Limitations

- A plan is a hypothesis. When implementation contradicts it, the plan is
  wrong — update it, do not quietly diverge.
- Planning cannot resolve a genuine requirements disagreement. Escalate.

## Efficiency guidance

- Inspect only what the plan needs. Planning is not an excuse for a full scan.
- Reuse `/forge`'s risk classification instead of redoing it.
- Short and specific beats long and hedged. Three real risks are worth more
  than twelve generic ones.
