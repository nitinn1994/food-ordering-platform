# ForgeFlow — `.claude/` Reference

This directory *is* ForgeFlow. It is a lightweight engineering lifecycle: a set
of rules, commands, agents, skills, workflows, and templates that keep a human
in control of what gets built.

New here? Read `../docs/README.md` first — it explains the lifecycle in plain
language. This file is the map of what lives where.

## The lifecycle

```text
Human Request → /forge (classify) → path selection
                                   ↓
   Quick (LOW)  ──────────────────────────→ Implement → targeted Validate
   Standard (MED) ── /plan → APPROVAL → Implement → Validate → Review
   Full (HIGH)  ── risk assessment → /plan → APPROVAL → Implement
                  → Validate → Specialised Review → /final-review
                  → /prepare-pr → human opens the PR
```

## Layout

```text
.claude/
├── README.md              this file
├── settings.json          permission guard rails (deny commit/push/merge/deploy)
├── rules/
│   ├── core.md            12 rules that apply to every task
│   ├── scope-control.md   what is in and out of a task
│   └── validation.md      how checks are run and reported
├── commands/
│   ├── forge.md           ENTRY POINT — classify risk, pick a path
│   ├── plan.md            write requirements / plan / test-plan
│   ├── implement.md       build one approved phase
│   ├── validate.md        run the project's real checks
│   ├── review.md          find problems, report by severity
│   ├── final-review.md    one verdict: READY_FOR_PR or not
│   └── prepare-pr.md      write a PR description
├── agents/                read-only helpers, used only when they pay for themselves
│   ├── repository-inspector.md
│   ├── implementation-reviewer.md
│   └── validation-reviewer.md
├── skills/                reusable technique (the how, not the what)
│   ├── repository-inspection/SKILL.md
│   ├── planning/SKILL.md
│   ├── validation/SKILL.md
│   └── review/SKILL.md
├── hooks/
│   └── README.md          why there are none yet, and which are safe to add
├── workflows/
│   ├── quick-path.md      LOW risk
│   ├── standard-path.md   MEDIUM risk
│   └── full-path.md       HIGH risk
└── templates/
    ├── requirements.md    plan.md    test-plan.md
    └── review-report.md   pr-description.md
```

## Commands vs. skills vs. agents

They are easy to confuse, so:

| | Answers | Invoked |
| --- | --- | --- |
| **Command** | *What* to do, and when | You type `/name` |
| **Skill** | *How* to do it well | Loaded when relevant |
| **Agent** | Does it in a separate context | Delegated to, for read-only fan-out |

Commands are the workflow. Skills are the craft. Agents keep large read-only
work out of your main conversation.

## When to use an agent

Only when it materially reduces work or improves accuracy. **Do not invoke
every agent for every task** — each one costs a separate context.

| Agent | Worth it when | Not worth it when |
| ----- | ------------- | ----------------- |
| `repository-inspector` | Unfamiliar or large repo; wide fan-out search | You already know the stack |
| `implementation-reviewer` | Full Path, or you wrote the code and want a second pass | Two-line doc fix |
| `validation-reviewer` | Full Path, or validation claims look thin | You watched the checks run |

## Risk classification

One table, in `commands/forge.md`. Everything else references it rather than
restating it — so changing the model means editing one file.

Highest dimension wins. When uncertain, pick the higher tier and say why.

## Safety guarantees

ForgeFlow never commits, pushes, merges, or deploys. This is enforced in three
places, deliberately overlapping:

1. `rules/core.md` rule 10 — the instruction.
2. Each command's hard limits — the reminder at the point of action.
3. `settings.json` `permissions.deny` — the mechanical block.

`settings.json` is a guard rail, not a jail. It stops accidents. You can still
run those commands yourself in your own terminal, which is the point.

## Extending it

Designed so each of these drops in without a rewrite:

| Want | Add |
| ---- | --- |
| Richer risk model | Edit the table in `commands/forge.md` |
| ADRs | `docs/adr/` + `commands/adr.md` |
| Dedicated security review | `agents/security-reviewer.md`, referenced from `full-path.md` |
| Enforced approval gate | A hook — see `hooks/README.md` |
| Cached project context | `.project/` — see `../docs/README.md` |
| Quality gates, CI, Docker, K8s, releases | Extend `commands/validate.md` |

Nothing here knows about a specific language or framework. Copy this directory
into another project and it works the same way — `../guide.md` covers adoption,
adaptation, verification, and troubleshooting.
