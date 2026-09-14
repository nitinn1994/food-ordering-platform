# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Food Ordering Platform

## Project Purpose

Build a food-ordering platform with:

- Next.js visual frontend
- Voice, text, and touch interactions
- Python AI service using LangChain and LangGraph
- NestJS commerce/domain API
- Menu, cart, and order workflows
- Persistent database
- Agent-generated UI commands

## Target Architecture

The system contains three primary applications:

1. `apps/web`
   - Next.js and React frontend
   - Visual UI
   - Voice and chat interface
   - Cart presentation
   - UI command handling

2. `apps/ai-service`
   - Python service
   - LangChain and LangGraph
   - Conversation handling
   - Tool selection
   - Structured intent generation
   - Agent explanations

3. `apps/commerce-api`
   - NestJS service
   - Menu, cart, order, and payment-related domain operations
   - Business validation
   - Authorization
   - Idempotency
   - Commerce workflows
   - Database access

## Important Boundaries

- The AI service must not directly access the commerce database.
- The AI service must not directly mutate cart or order state.
- Business operations must go through the NestJS API.
- The frontend must not treat arbitrary AI output as executable code.
- UI commands must use validated schemas.
- The backend is authoritative for commerce state.
- The frontend displays backend-confirmed state.
- Conversation history is not the source of truth for cart or order data.

## Initial Development Scope

The first milestone is frontend-first and simulation-first.

Do not initially implement:

- Real AI model integration
- Real voice provider
- Real payments
- Production authentication
- Kubernetes deployment
- Production infrastructure
- Distributed tracing
- Multi-region deployment

## ForgeFlow Rules

- Start non-trivial tasks with `/forge`.
- Inspect before planning.
- Obtain human approval before medium- and high-risk implementation.
- Do not commit, push, merge, or deploy unless explicitly requested.
- Never claim a validation command passed unless it was executed.
- Keep each phase within its approved scope.

## Development Rules and Discipline

Read `.claude/rules/` before starting any work:

- **core.md** — Fundamental principles: inspect before modifying, follow architecture, keep changes focused, never expand scope silently, report assumptions, only claim executed validations.
- **scope-control.md** — Defines task boundaries; follow the approved plan exactly, report follow-up work rather than fixing it.
- **validation.md** — How to run and report checks; use only repository-declared commands, distinguish executed from unexecuted results.

These rules are non-negotiable. A violation is indistinguishable from hidden bugs.

## Repository Structure

```
apps/web/               — Next.js frontend (React, voice UI, chat, cart)
apps/ai-service/       — Python service (LangChain, LangGraph, intent generation)
apps/commerce-api/     — NestJS API (menu, cart, orders, payments, database)
packages/contracts/    — Shared types and interfaces
  └── ui-commands/     — UI command schemas (validated; AI → frontend)
  └── agent-intents/   — Intent schemas (validated; AI reasoning output)
  └── api-contracts/   — API request/response contracts
infrastructure/        — Docker, database, Kubernetes configs (for future)
docs/                  — Architecture, API, decisions, development guides
.claude/               — Claude Code configuration, rules, skills, workflows
```

The platform is a **monorepo**. Each app is developed independently but shares contracts in `packages/contracts/`. Contracts are the API between components.

## Early-Stage Development Notes

Currently (initial phase):

- **Apps are empty shells.** Each will be bootstrapped with standard tooling (Next.js, Python FastAPI or similar, NestJS).
- **Database is simulated.** The commerce-api will stub out database operations; real persistence comes later.
- **AI integration is simulated.** The ai-service will have placeholder tool definitions; real models and external APIs come later.
- **No authentication required yet.** The system assumes a single user.
- **No deployment.** Local development only; infrastructure code is a template.

## Setting Up a New App

When starting work on an app (e.g., `apps/web`):

1. **Inspect the app directory** — Check for existing `package.json`, `pyproject.toml`, or build config.
2. **Check `docs/development/`** — Refer to getting-started.md for bootstrap commands specific to this project.
3. **Bootstrap the app** — Initialize the framework (Next.js, Python venv, NestJS) with standard tooling.
4. **Define contracts first** — Agree on what this app exposes to others; add to `packages/contracts/`.
5. **Implement against contracts** — Build internals to match the interface, not the other way around.
6. **Test locally** — Run the app in isolation before integration.

## Data Flow and Boundaries

**Never break these boundaries:**

- **Frontend ↔ AI Service:** UI commands only. The frontend sends text/voice input; the AI service returns UI commands and explanations. No raw AI output reaches the UI.
- **AI Service ↔ Commerce API:** HTTP calls only. The AI service calls the API to read menu data and submit cart operations. No direct database access.
- **Commerce API ↔ Database:** The API is the sole writer. Cart and order state are authoritative here, not in conversation or AI memory.

The **backend is always right** — if frontend and backend state disagree, the backend wins. The frontend refreshes from the backend after every operation.

## Common Patterns

### Validated Schemas
All cross-service data uses contracts. Example flow:

1. AI service generates intent (matches `agent-intents` schema).
2. Frontend receives UI commands (matches `ui-commands` schema).
3. Commerce API accepts structured requests (matches `api-contracts` schema).

Schemas are defined in `packages/contracts/` and generated/validated in each app.

### Conversation vs. State
- **Conversation history** — Stored in the ai-service; for context and explanations only.
- **Cart state** — Owned by commerce-api; canonical source of truth.
- **Order state** — Owned by commerce-api; persisted in database.

Do not use conversation history to infer cart or order state. Always fetch from the API.

### Error Handling
- **Frontend:** Display user-friendly errors; call the API to refresh state if unsure.
- **AI Service:** Log errors; return empty or fallback response; never mutate state on error.
- **Commerce API:** Validate all inputs; return structured errors with specific codes; guarantee idempotency on retries.

## Validation and Testing

No universal test or lint setup yet (apps are empty). As each app is bootstrapped:

- **Add test commands** to the app's build system (Jest, pytest, etc.).
- **Add lint commands** (ESLint, Black, NestJS style).
- **Run targeted tests** — Only test what changed between phases.
- **Report results** using the status vocabulary in `validation.md` — `PASS`, `FAIL`, `SKIPPED`, `NOT_CONFIGURED`.

A result like "no checks exist yet" is valid and honest; it means we're on the quick path or early in setup.
