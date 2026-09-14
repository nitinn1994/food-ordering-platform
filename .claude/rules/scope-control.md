# Scope Control

The single most common failure mode is a change that quietly grew. This rule
defines the boundary.

## What is inside the current task

Only these:

- What the approved plan describes, phase by phase.
- Changes without which the approved work would not function or would not
  compile.
- Tests covering the acceptance criteria of the approved work.
- Documentation that the approved work makes wrong if left unchanged.

On the Quick Path there is no written plan, so "inside" means the literal
request and nothing more.

## What is outside the current task

Everything else, including things that are genuinely good ideas:

- Refactoring code you happened to read.
- Renaming for consistency.
- Fixing an unrelated bug you noticed.
- Upgrading a dependency.
- Reformatting files the task did not otherwise touch.
- Adding tests for pre-existing untested code.
- Removing code that looks dead.
- "While I was in there" improvements of any kind.

Being correct does not make a change in scope.

## How to report discovered follow-up work

Do not fix it. Record it and continue:

```text
FOLLOW-UP (not done): <file:line> — <what is wrong> — <suggested fix> — <severity>
```

Put these in the implementation report, and carry them into
`pr-description.md` under "Follow-up work". The human decides what happens.

## How to request a scope change

When the approved work genuinely cannot be completed inside the plan, stop and
say exactly this much:

1. What the plan assumed.
2. What is actually true.
3. The smallest change that would make the plan work.
4. What that costs — files touched, risk, whether the risk level changes.

Then wait. Do not implement the larger change and explain afterwards. If the
change pushes the task into a higher risk tier, say so — it may need the Full
Path instead of the Standard Path.

## Unrelated refactoring

If a file must be touched to complete approved work, change only the lines the
work requires. Leave the surrounding style as you found it, even if it is
worse than what you would write. A diff a reviewer can read in one pass is
worth more than a tidier file.
