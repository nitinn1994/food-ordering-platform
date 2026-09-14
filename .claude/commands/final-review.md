---
description: Decide whether the work is ready for a pull request. Produces exactly one verdict.
argument-hint: <feature-name>
---

# /final-review

## Purpose

One gate, one verdict, before a human spends time on a pull request.

## Rules

- Produce **exactly one** of these two verdicts. Never both, never a hedge:

  ```text
  READY_FOR_PR
  NOT_READY_FOR_PR
  ```

- Do not fix anything here. This command decides; it does not build.
- Do not declare readiness because the work "looks done". Check the evidence.

## Checklist

Answer each item with evidence, not opinion:

1. **Acceptance criteria** — walk `requirements.md` criterion by criterion.
   For each: met / not met / cannot verify, and how you know.

2. **Plan conformance** — was every phase of `plan.md` implemented? Was
   anything implemented that the plan did not contain?

3. **Validation evidence** — what did `/validate` actually run, and what were
   the results? A check that was never executed is not evidence. Any `FAIL` is
   automatically `NOT_READY_FOR_PR`.

4. **Review findings** — are all `BLOCKER` and `HIGH` findings from `/review`
   resolved? Any unresolved one is automatically `NOT_READY_FOR_PR`.
   `MEDIUM` and below may be deferred if the human accepted them.

5. **Scope** — no unapproved additions. Unapproved scope is a blocker unless
   the human approved it in the conversation.

6. **Working tree** — does it contain only the expected changes? Stray files,
   build artefacts, editor droppings, and `.env` files are findings.

7. **Safety** — confirm nothing was committed, pushed, merged, or deployed
   during this work. State this explicitly.

8. **Known limitations** — list them. Limitations do not block by themselves,
   but they must be written down so they reach the PR description.

## Verdict rules

Return `NOT_READY_FOR_PR` if any of the following is true:

- an acceptance criterion is not met,
- a validation check FAILed,
- a `BLOCKER` or `HIGH` review finding is unresolved,
- the working tree contains unexpected changes,
- unapproved scope is present,
- you could not verify something the criteria depend on.

Otherwise return `READY_FOR_PR`.

## Output

```text
VERDICT: READY_FOR_PR | NOT_READY_FOR_PR

Acceptance criteria: <n met / n total>
Validation:          <summary of statuses>
Review findings:     <BLOCKER/HIGH resolved?>
Scope:               <clean / additions>
Working tree:        <expected changes only? >
Safety:              no commit, no push, no merge, no deploy
Known limitations:   <list or none>

Reasons (if NOT_READY_FOR_PR):
- ...
```

## Extension point

Later this can require sign-off from specialised reviewers or a risk-tiered set
of gates. Today it is one checklist and one verdict.
