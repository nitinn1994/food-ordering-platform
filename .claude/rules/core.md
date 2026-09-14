# Core Rules

These rules apply to every task in this repository. They are short on purpose.

Companions: `scope-control.md` (what is in and out of a task) and
`validation.md` (how checks are run and reported).

## 1. Inspect before modifying

Read the relevant files before changing them. If you have not read a file, you
may not edit it. If you cannot find the authoritative source for a fact (a
command, a dependency, a config value), say so instead of guessing.

## 2. Follow the existing architecture

Match the patterns, naming, and structure that are already in the project. If
the right change requires breaking an existing pattern, stop and say so before
doing it. Never change the architecture silently.

## 3. Keep changes focused

Change what the approved plan asks for and nothing else. Unrelated cleanups,
refactors, renames, dependency bumps, and formatting sweeps are separate work.
If you notice something worth fixing, report it rather than fixing it inline.

## 4. Do not expand scope silently

If the work turns out to be bigger than the plan, stop and report the gap. The
human decides whether to grow the scope. A larger change is never justified by
"it was easier while I was in there".

## 5. Ask when requirements are unclear

If two reasonable readings of the request lead to materially different work,
ask. Do not pick one and build it quietly. For small judgement calls, decide,
state the assumption, and continue.

## 6. Preserve existing useful work

Before replacing a file, understand what it does and why it exists. If the
repository already has something that solves the problem, improve or reuse it
rather than creating a second version beside it. Duplicated lifecycle
machinery is worse than none.

## 7. Report assumptions

State the assumptions a piece of work rests on, and mark which ones you
verified and which you did not. An unstated assumption that turns out false is
indistinguishable from a bug you hid.

## 8. Never claim unexecuted validation passed

Only report a check as passing if you actually ran it and saw it pass. Use the
shared status vocabulary:

| Status          | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| PASS            | Ran it, it succeeded.                                       |
| FAIL            | Ran it, it failed.                                          |
| SKIPPED         | Configured and possible, but deliberately not run. Say why. |
| NOT_CONFIGURED  | The project has no such check set up.                       |
| NOT_APPLICABLE  | The check does not apply to this change.                    |

"Probably passes", "should work", and "tests look fine" are not results.

## 9. Human approval before implementation

Planned work is implemented only after the human approves the plan. `/plan`
ends by asking for approval. `/implement` refuses to start without it.

## 10. No commit, push, merge, or deploy

Leave all work uncommitted for human inspection. Do not run `git commit`,
`git push`, `git merge`, `gh pr create`, or any deploy command unless the human
explicitly asks for that specific action in the current conversation.

## 11. Stop when blocked

If continuing would require guessing, exceeding the approved scope, or leaving
the repository in a broken state, stop and report. A partial change with a
clear explanation is safer than a complete change built on a guess.

## 12. Report honestly

Say what changed, what was verified, and what was not. Known limitations
belong in the report, not in silence.
