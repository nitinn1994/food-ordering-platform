---
description: Entry point for the ForgeFlow lifecycle. Classifies a request as LOW/MEDIUM/HIGH, picks the Quick, Standard, or Full path, and names the next command.
argument-hint: <what you want to do>
---

# /forge

## Purpose

Decide *how much process* a request deserves, before any work starts.

This command routes. It does not implement, and it does not plan.

## Steps

1. **Understand the request.** Restate it in one sentence. If it is ambiguous
   in a way that changes the risk level, ask now — one question, not a list.

2. **Inspect only what classification needs.** Usually: which area of the code
   this touches, and whether that area handles auth, data, money, or
   infrastructure. **If reliable inspection context already exists in this
   conversation, reuse it — do not re-scan.** A full repository scan to
   classify a CSS tweak is waste.

3. **Classify.** Use the table below.

4. **Report the routing** in the short form shown under "Output", with a
   two-to-three sentence justification.

5. **Stop.** Name the next command; do not run it. The human invokes it.

   The one exception: on the Quick Path you may continue directly into the
   work, because the Quick Path has no approval gate. Say that you are doing so.

## Risk classification

This table is the canonical definition. Other documents reference it rather
than restating it.

| Dimension | LOW | MEDIUM | HIGH |
| --------- | --- | ------ | ---- |
| Scope | one file / one component | a feature across a few modules | cross-cutting, or architectural |
| Security impact | none | indirect | touches auth, authz, secrets, crypto, input trust boundaries |
| Data impact | none | new reads/writes, no schema change | migration, deletion, backfill, PII |
| API compatibility | none | additive | breaking change to a published contract |
| Infrastructure | none | config within existing shape | new service, network, IAM, deploy topology |
| User / business impact | cosmetic or internal | normal feature behaviour | payments, access, availability, legal |
| Reversibility | trivially revertible | revertible with care | hard or impossible to reverse |

**Rule: the highest dimension wins.** A one-line change to a permission check
is HIGH, not LOW, because its security dimension is HIGH.

**When uncertain, choose the higher tier and say why**, then ask the human
whether to drop down. Over-processing a small change costs minutes;
under-processing a risky one costs the repository.

## Path selection

| Risk | Path | Flow |
| ---- | ---- | ---- |
| LOW | Quick | Inspect → Implement → targeted `/validate` |
| MEDIUM | Standard | Inspect → `/plan` → **approval** → `/implement` → `/validate` → `/review` |
| HIGH | Full | Inspect → risk assessment → `/plan` → **approval** → `/implement` → `/validate` → specialised review where relevant → `/final-review` → `/prepare-pr` |

Details: `.claude/workflows/quick-path.md`, `standard-path.md`, `full-path.md`.

A task may be promoted mid-flight. If implementation reveals the change is
riskier than classified, stop and re-run `/forge` — see
`.claude/rules/scope-control.md`.

## Hard limit

**Never implement HIGH-risk work directly from `/forge`.** No matter how small
the diff looks, HIGH-risk work goes through a plan and a human approval.

## Output

```text
Request:  <one-sentence restatement>
Risk:     LOW | MEDIUM | HIGH
Path:     Quick | Standard | Full
Because:  <2-3 sentences, naming the dimension that set the level>
Next:     <command to run, or the Quick Path work about to be done>
```

## Examples

```text
/forge Fix the dashboard button alignment
  Risk:  LOW      (cosmetic, one component, trivially revertible)
  Path:  Quick
  Next:  targeted implementation, then /validate on the touched area
```

```text
/forge Add OAuth login with database-backed sessions
  Risk:  HIGH     (security boundary + schema change + hard to reverse)
  Path:  Full
  Next:  /plan oauth-login
```

```text
/forge Add a search filter to the products page
  Risk:  MEDIUM   (a feature across a few modules, no security or data risk)
  Path:  Standard
  Next:  /plan product-search-filter
```

## Extension point

Risk classification is one table in one file. Replacing it with a richer model
later — weighted scoring, per-area overrides, a `.project/risk.yaml` — means
editing this section, not the commands downstream.
