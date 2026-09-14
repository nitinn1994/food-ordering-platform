---
description: Write a pull request description for the human to use. Does not create, open, approve, or merge a PR.
argument-hint: <feature-name>
---

# /prepare-pr

## Purpose

Hand the human a PR description they can paste into GitHub.

## Hard limits

- **Do not run `git commit`, `git push`, `gh pr create`, or any merge/deploy
  command.** This command writes text and nothing else.
- Do not claim a check passed unless `/validate` actually executed it.
- If `/final-review` returned `NOT_READY_FOR_PR`, say so at the top and let the
  human decide whether they still want the draft.

## Steps

1. Read `docs/features/<feature-name>/` and the results of `/validate`,
   `/review`, and `/final-review`.
2. List the changed files (`git diff --name-status` if this is a git
   repository, otherwise the files the implementation reported).
3. Fill in `.claude/templates/pr-description.md`, write it to
   `docs/features/<feature-name>/pr-description.md`, and print it.

## Template

The canonical template is `.claude/templates/pr-description.md`. It covers:
title, problem, solution, implementation summary, changed files, executed vs.
unexecuted validation, acceptance criteria, known limitations, follow-up work,
risks, and deployment considerations.

Abbreviated shape:

```markdown
## Problem

<what was wrong or missing, and why it mattered>

## Solution

<what this change does, in a few sentences>

## Changes

| File | Change |
| ---- | ------ |
| ...  | ...    |

## Validation

Two separate tables: **executed** (command + PASS/FAIL + evidence) and
**not executed** (SKIPPED / NOT_CONFIGURED / NOT_APPLICABLE + why). Never merge
them into one table.

## Acceptance criteria

- [x] <criterion, verified how>
- [ ] <criterion not met, why>

## Known limitations · Follow-up work · Risks · Deployment considerations
```

## Final line

End with:

```text
PR description ready at docs/features/<feature-name>/pr-description.md.
Nothing was committed or pushed. Creating and merging the PR is yours to do.
```

## Extension point

Later this can attach release notes, deployment checklists, or rollback plans.
Today it is a description for a human.
