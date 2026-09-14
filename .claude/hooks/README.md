# Hooks

**There are no hooks in this repository, deliberately.**

A hook is a shell command Claude Code runs automatically at a lifecycle event —
before a tool call, after an edit, when a session starts. They are the only way
to make a rule *enforced* rather than *followed*.

They are also the fastest way to make a workflow unusable. A hook that fires on
every command, prints noise, or blocks legitimate work gets disabled within a
day, and then no rules are enforced at all.

## Why none yet

This repository has no application code, no build, and no CI. There is nothing
for a hook to usefully guard. Adding hooks now would mean guessing at commands
that do not exist.

Mechanical safety is currently provided by `.claude/settings.json`, which denies
commit, push, merge, and deploy commands at the permission layer. That is
narrower and less fragile than a hook.

## Safe hooks worth adding later

Each of these is safe because it **informs** rather than blocks, or blocks only
something genuinely destructive.

| Hook | Event | What it would do |
| ---- | ----- | ---------------- |
| Plan-approval check | `PreToolUse` on Edit/Write | Warn when editing code while `requirements.md` still reads `Approval Status: PENDING`. |
| Validate-before-review reminder | `UserPromptSubmit` on `/review` | Note that `/validate` has not run since the last edit. |
| Uncommitted-changes notice | `SessionStart` | Report an already-dirty working tree, so new work is not confused with old. |
| Generated-file guard | `PreToolUse` on Write | Warn before writing into `dist/`, `build/`, `node_modules/`, or a lockfile. |
| Destructive-command confirmation | `PreToolUse` on Bash | Require confirmation for `rm -rf`, `git reset --hard`, `git clean -fd`, `DROP TABLE`. |
| Secret scan | `PostToolUse` on Edit/Write | Flag a likely key or token in a diff. |

Start with **one**. Live with it for a week before adding a second.

## Rules for any hook added here

A hook must not:

- Install dependencies.
- Commit, push, merge, tag, or deploy.
- Modify files the developer did not ask it to modify.
- Produce output on every command. Noise is how hooks die.
- Block ordinary development without a clear safety benefit.
- Depend on a tool the repository does not declare.

A hook should:

- Be a readable shell script in this directory, not an inline one-liner.
- Exit 0 when it has nothing to say.
- Say what is wrong *and what to do about it*.
- Be individually disableable.
- Be fast — tens of milliseconds, not seconds.

## How to add one

1. Write the script here, e.g. `.claude/hooks/plan-gate.sh`. Make it executable.
2. Register it in `.claude/settings.json` under `hooks`.
3. Test it deliberately, including the case where it should stay silent.
4. Document it in the table above.

Hook configuration is a Claude Code feature; check the current documentation for
the exact `settings.json` schema before wiring one up.
