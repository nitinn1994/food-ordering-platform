# Quick Path

**Risk: LOW.** For changes where the cost of being wrong is a quick revert.

```text
Inspect → Implement → Targeted Validate
```

## When it applies

- Documentation and comments.
- Small styling or layout fixes.
- Simple UI adjustments with no logic change.
- Minor bug fixes contained in one place.
- Small configuration changes with no infrastructure effect.

## When it does not apply

Anything touching auth, permissions, payments, personal data, migrations,
infrastructure, or a published API contract — **regardless of diff size**. A
one-line change to a permission check is HIGH risk. See the classification
table in `.claude/commands/forge.md`.

## Steps

1. **Inspect** only the area being changed (`.claude/skills/repository-inspection`).
2. **Implement** the literal request. No plan document is written — which is
   exactly why scope discipline matters most here
   (`.claude/rules/scope-control.md`).
3. **Validate, targeted** — the checks relevant to what changed. Report it as a
   targeted run (`/validate`).

## Approval

No plan approval gate. The human approved by asking. Nothing else is implied.

## Validation expectations

Targeted, not full. If the touched area has no configured checks, report
`NOT_CONFIGURED` and say what you verified by reading instead.

## Review expectations

None formally. State what changed and what you verified.

## Exit conditions

- The request is satisfied.
- Targeted validation ran, or its absence is reported honestly.
- No files changed beyond the request.
- Nothing committed, pushed, merged, or deployed.

## Escalate when

- The change turns out to touch a HIGH-risk dimension.
- More than a couple of files need to change.
- You need to guess at intent.
- A fix requires changing shared or unfamiliar code.

Stop and re-run `/forge`. Escalating costs one message; not escalating costs a
bad change.
