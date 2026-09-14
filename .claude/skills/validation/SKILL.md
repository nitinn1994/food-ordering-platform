---
name: validation
description: Use when running or reporting checks - discovering a project's real commands, choosing targeted vs. full runs, and reporting PASS/FAIL/SKIPPED/NOT_CONFIGURED/NOT_APPLICABLE honestly. Guards against inventing commands or overstating results.
---

# Validation

## Purpose

Run the checks a project actually has, and report results that can be trusted
without re-running them.

## When to use

After each implementation phase (targeted), before `/review` (full), and any
time you are about to make a claim about whether something works.

## Inputs

What changed, and the repository's own configuration files.

## Procedure

1. **Discover, ranked by trust.** CI workflows first — they define what
   actually gates a merge. Then manifests and task runners. Then
   `docs/development/getting-started.md`.

2. **If no source declares a check, it is `NOT_CONFIGURED`.** Not failed, not
   passed, not substituted with something similar. Running `pytest` because a
   project "looks like Python" is fabrication even when it works.

3. **Choose the scope deliberately:**

   | Run | When | Report it as |
   | --- | ---- | ------------ |
   | targeted | mid-implementation, Quick Path | "targeted run on <area>" |
   | full | before review, before final review | full validation |

   Never let a targeted run be read as a full one.

4. **Order the checks** so cheap failures surface first: format → lint → types
   → tests → build. Stop early only when a failure makes later checks
   meaningless, and record the rest as `SKIPPED` with that reason.

5. **Capture evidence as you go** — the exact command, the exit status, and for
   failures the actual output lines. Evidence gathered afterwards from memory
   is not evidence.

6. **Do not install anything** to make a check runnable. Report the blocker.

## Outputs

| Check | Command | Status | Evidence |
| ----- | ------- | ------ | -------- |

Plus a one-line summary that does not overstate. If nothing ran: "no checks
executed" — never "validation passed".

## Limitations

- Passing checks show the checks passed. They do not show the feature works, or
  that the tests test the right thing.
- Absence of a check is not absence of a problem.

## Efficiency guidance

- Discover once per session and reuse it; do not re-read `package.json` before
  every run.
- Targeted runs mid-implementation are cheaper than full suites and catch most
  mistakes at the point they were made.
- Do not re-run a suite you have not invalidated.

## Honesty checklist

Before reporting, confirm each:

- [ ] Every command listed was actually executed.
- [ ] Every `PASS` has a command and a result.
- [ ] No `SKIPPED` or `NOT_CONFIGURED` row is being summarised as green.
- [ ] Failures are reported as failures, even if they look pre-existing.
- [ ] The summary distinguishes "ran and passed" from "did not run".
