---
name: repository-inspection
description: Use when you need to understand a repository's structure, stack, conventions, or validation commands - especially before planning or implementing. Teaches cheap, targeted inspection instead of repeated full scans.
---

# Repository Inspection

## Purpose

Learn what a repository is, at the lowest cost that still gives a reliable
answer. Repeated full scans are the single largest avoidable token cost in this
workflow.

## When to use

- Before `/plan`, to find affected files and existing patterns.
- Before `/implement`, to confirm assumptions still hold.
- When you do not know the stack or the validation commands.

**When not to use:** when this conversation already established the facts you
need. Reuse them. Re-inspect only what may have changed.

## Inputs

The question you need answered. Inspect for a question, never "to have a look".

## Procedure

1. **Ask the narrowest question.** "Where is auth handled?" is cheap.
   "Understand the codebase" is unbounded.

2. **Go manifest-first.** One `package.json` or `pyproject.toml` tells you more
   about the stack than fifty source files. Read declarations before code.

3. **Locate before reading.** `glob` for filenames, `grep` for symbols, and
   only then read the few files that matched. Read whole files only when you
   are about to modify them.

4. **Escalate in layers, stopping as soon as the question is answered:**

   | Layer | Cost | Answers |
   | ----- | ---- | ------- |
   | manifests + README + CLAUDE.md | low | stack, commands, conventions |
   | directory listing | low | shape, where things live |
   | targeted grep | low | where a concept lives |
   | read matched files | medium | how it actually works |
   | read callers and tests | high | why it works that way |

5. **Exclude noise.** `node_modules`, `.git`, `dist`, `build`, `target`,
   `venv`, `vendor`, lockfiles, `__pycache__`.

6. **Delegate wide fan-out.** If the question spans many directories or naming
   conventions, use the `repository-inspector` agent — it returns a summary
   instead of filling this conversation with file dumps.

7. **Record once.** Write durable findings (stack, validation commands) into
   `docs/development/getting-started.md` so the next session reads instead of
   re-derives.

## Outputs

A short summary answering the question, plus what you did not examine.

## Limitations

- Recorded context goes stale. **Authoritative files always win over notes.**
  If `getting-started.md` and `package.json` disagree, `package.json` is right
  and the note needs fixing.
- Inspection tells you what the code does, never what it should do. That comes
  from the human.

## Efficiency guidance

- Never re-scan to confirm something you already read this session.
- Never read a file you are not going to reason about.
- Prefer `grep -l` (names) over `grep` (contents) when you only need location.
- A 40-line answer citing 3 files beats a 400-line answer citing 30.
