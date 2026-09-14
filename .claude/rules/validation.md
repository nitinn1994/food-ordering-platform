# Validation

## Use the repository's own commands

Run only commands declared in the repository. Authoritative sources, in
descending order of trust:

1. CI workflow files (`.github/workflows/*.yml`) — what actually gates merges.
2. Manifests and task runners — `package.json` scripts, `Makefile`,
   `justfile`, `Taskfile.yml`, `pyproject.toml`, `Cargo.toml`, `go.mod`,
   `pom.xml`, `build.gradle*`, `composer.json`.
3. `docs/development/getting-started.md` — the project's recorded commands.

## Never invent a command

If no source declares a check, its status is `NOT_CONFIGURED`. Not failed, not
passed, not approximated with something similar. A plausible-looking command
that was never part of this project is a fabrication even when it runs.

Do not install packages to make a check runnable. Report the blocker instead.

## Separate executed from unexecuted

Every report must make this distinction visible. A check that did not run is
never evidence of anything.

| Status | Meaning | Counts as evidence? |
| ------ | ------- | ------------------- |
| `PASS` | Ran; exit code 0. | Yes |
| `FAIL` | Ran; failed. | Yes — of a problem |
| `SKIPPED` | Could have run; deliberately not run. Reason required. | No |
| `NOT_CONFIGURED` | The project has no such check. | No |
| `NOT_APPLICABLE` | The check does not apply to this change. Reason required. | No |

## Report failures honestly

- Include the exact command for every `PASS` and `FAIL`.
- For `FAIL`, include the key output lines — not a summary of them.
- Never describe a run as passing because the remaining failures look
  unrelated, pre-existing, or flaky. Report the result, then say you believe it
  is pre-existing and why.
- "No checks executed" is the correct summary when nothing ran. It is never
  "validation passed".

A clean report consisting entirely of `NOT_CONFIGURED` rows is a true and
useful statement about the project. It is not a green light.

## Targeted validation

On the Quick Path, and between phases on the other paths, run only the checks
relevant to what changed — the tests for the touched module, the linter on the
touched files. Say that the run was targeted, so nobody reads it as a full
validation. The full set runs before `/review`.
