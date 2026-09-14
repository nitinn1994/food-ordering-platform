---
description: Discover and run the project's own formatting, lint, type, test, and build checks, then report each one honestly.
argument-hint: [check-name]
---

# /validate

## Purpose

Run the checks this project actually has, and report the truth about each one.

## The one hard rule

**Never invent a command.** Every command you run must be declared in a file in
this repository. If nothing declares it, the check is `NOT_CONFIGURED` — not
failed, not passed, not improvised.

## Steps

1. **Discover.** Read whichever of these exist and collect the declared
   commands:

   - `package.json` (`scripts`)
   - `Makefile` / `Justfile` / `Taskfile.yml`
   - `pyproject.toml`, `tox.ini`, `noxfile.py`, `setup.cfg`
   - `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle*`, `composer.json`
   - `.github/workflows/*.yml` (what CI runs is authoritative)
   - `justfile`, `Taskfile.yml`
   - `docs/development/getting-started.md` (the project's recorded commands)
   - any `.editorconfig`, linter, or formatter config that implies a tool

   Report the sources you used.

2. **Run** the applicable checks, in this order, stopping early only if a
   failure makes later checks meaningless:

   | Check       | Typical purpose                     |
   | ----------- | ----------------------------------- |
   | format      | formatting / style                  |
   | lint        | static analysis                     |
   | types       | type checking                       |
   | test        | automated tests                     |
   | build       | the project compiles / bundles      |

   Run only what the project declares. Do not install dependencies to make a
   check runnable — report the blocker instead.

3. **Report** a table, one row per check:

   | Check | Command | Status | Evidence |
   | ----- | ------- | ------ | -------- |
   | lint  | the exact command run | PASS | `0 problems` |
   | tests | the exact command run | FAIL | `3 failed, 41 passed` |
   | build | —       | NOT_CONFIGURED | no build script declared |

   Using exactly these statuses:

   ```text
   PASS            ran it, it succeeded
   FAIL            ran it, it failed
   SKIPPED         could have run it, deliberately did not (say why)
   NOT_CONFIGURED  the project has no such check
   NOT_APPLICABLE  the check does not apply to this change
   ```

   Include the exact command executed for every PASS and FAIL, and the key
   lines of output for every FAIL.

4. **Summarise honestly.** If nothing ran, say "no checks executed" — never
   "validation passed". A clean report with four `NOT_CONFIGURED` rows is a
   statement about the project, not a green light.

## Note for this repository

ForgeFlow currently has no application code and no configured checks, so today
every code check reports `NOT_CONFIGURED`. Markdown and config files can still
be sanity-checked by reading them. Record real commands in
`docs/development/getting-started.md` as soon as the stack exists.

## Full rules

`.claude/rules/validation.md` — including targeted vs. full runs, and why a
report of all `NOT_CONFIGURED` rows is honest rather than green.

## Extension point

Later this can gain coverage thresholds, security scanning, container builds,
and per-risk-level required checks. Today it only runs what exists.
