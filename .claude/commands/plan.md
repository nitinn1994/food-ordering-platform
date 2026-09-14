---
description: Understand a request, inspect the code, and write a feature plan for human approval. Does not change production code.
argument-hint: <feature-name> [short description]
---

# /plan

## Purpose

Turn a request into a plan a developer can read, disagree with, and approve.

## Rules

- Read `.claude/rules/core.md` first.
- **Do not modify production code in this command.** The only files you write
  are the three documents under `docs/features/<feature-name>/`.
- Do not invent commands, dependencies, or technology choices. Every command
  you reference must exist in the repository's own config files.

## Steps

1. **Understand the request.** Restate it in your own words. If two readings
   would lead to different work, ask now — before inspecting everything.

2. **Inspect the relevant code.** Find the files this touches, the patterns
   already used, and the tests that already exist. Read them; do not assume.

3. **Classify the risk.** Use the table in `.claude/commands/forge.md`. Record
   the level and the resulting path in `requirements.md`. If `/forge` already
   classified this request, reuse that result — do not redo it.

4. **Write the documents.** Create `docs/features/<feature-name>/` (kebab-case)
   by copying `.claude/templates/`:

   - `requirements.md` — the problem, what is in scope, what is out of scope,
     and **acceptance criteria** written so each one can be checked. Also:
     risk level, path, and `Approval Status: PENDING`.
   - `plan.md` — affected files and modules, implementation steps broken into
     small logical phases, risks, assumptions, open questions, and whether
     **specialised review** is needed (Full Path only: security, performance,
     data/migration).
   - `test-plan.md` — what will be tested, how, and which validation commands
     will be run. Only list commands the project actually has.

5. **Keep it small.** If the plan has more than ~5 phases, it is probably two
   features. Say so and suggest the split.

6. **Ask for approval.** End with a short summary and this line:

   ```text
   Risk: <LOW|MEDIUM|HIGH>   Path: <Quick|Standard|Full>
   Approval Status: PENDING

   Plan ready for review at docs/features/<feature-name>/.
   Reply "approved" to proceed to /implement, or tell me what to change.
   ```

   Then stop. Do not start implementing.

## Output

A one-screen summary: the goal, the phases, the acceptance criteria, the main
risk, and the open questions.

## Extension point

Later this command can require an ADR for architectural decisions, or route
HIGH-risk plans to dedicated security and performance reviewers. Today it flags
that they are needed; a human performs them.
