# System Architecture

**Status:** Baseline, established in Phase 0. Describes the *intended* system.
**Last updated:** 2026-09-14
**Related:** [`phase-0-discovery.md`](./phase-0-discovery.md) ·
[`architecture-decisions.md`](./architecture-decisions.md)

> Nothing described here is implemented yet. Every application directory is
> empty. This document exists so that the first line of code written has a
> boundary to respect, rather than a boundary invented after the fact.

---

## 1. Components

| Component | Stack | Owns | Must never |
| --------- | ----- | ---- | ---------- |
| `apps/web` | Next.js, TypeScript | Rendering, voice/text/touch input, cart presentation, UI command execution | Execute AI-generated code; treat agent text as authoritative for price, totals, or availability |
| `apps/ai-service` | Python, LangChain, LangGraph | Conversation state, tool selection, structured intent generation, natural-language explanations | Touch the database; mutate cart or order state directly |
| `apps/commerce-api` | NestJS, TypeScript | Menu, cart, order, pricing, business validation, authorization, idempotency | Depend on conversation history as a source of truth |
| `packages/contracts` | TypeScript (Zod) → JSON Schema → Pydantic | The three schema families below; the shared vocabulary of the system | Contain business logic, runtime behaviour, or transport code |
| Database | TBD (simulated in early phases) | Durable commerce state | Be reachable by anything except `commerce-api` |

## 2. Topology

```mermaid
flowchart TD
    User(["User — voice, text, touch"])
    Web["apps/web<br/>Next.js"]
    AI["apps/ai-service<br/>Python, LangGraph"]
    API["apps/commerce-api<br/>NestJS"]
    DB[("Database")]

    User <--> Web
    Web -->|"conversational turn"| AI
    AI -->|"agent response + UI commands"| Web
    Web -->|"direct reads + touch-driven mutations"| API
    AI -->|"menu reads, cart operations"| API
    API --> DB

    AI -.->|"FORBIDDEN"| DB
```

The dotted line is the boundary that matters most. It is not enforced by
anything mechanical today — no network policy, no credential separation — so
until it is, it is enforced by review.

## 3. Request walkthrough

A conversational turn, end to end:

1. **User speaks or types** in `apps/web`.
2. **Web forwards the utterance** plus a conversation reference to
   `ai-service`. It does not send cart state — the AI service is not trusted
   to be the source of truth for it.
3. **`ai-service` reasons** (LangGraph), reading menu data from
   `commerce-api` over HTTP as needed.
4. **`ai-service` produces a business intent** — a structured object validated
   against the `agent-intents` schema, e.g. `AddItemToCart { itemId, quantity }`.
5. **`ai-service` submits that intent to `commerce-api`**, which is what
   actually executes it. The AI service asks; it never applies.
6. **`commerce-api` validates and applies** — business rules, pricing,
   idempotency, persistence — and returns the authoritative resulting state.
7. **`ai-service` returns to web**: a natural-language explanation, plus a set
   of **UI commands** validated against the `ui-commands` schema.
8. **Web validates every UI command** against a closed allowlist, discards
   anything unrecognised, and renders the survivors.
9. **Web refetches authoritative state** (cart, totals, order) from
   `commerce-api`. What the user sees as their cart always came from the
   backend, never from the agent's description of it.

A touch interaction skips steps 2–7 entirely: `apps/web` calls `commerce-api`
directly, then refreshes. The AI service is not in the path of a button press.

## 4. The four boundaries

### 4.1 AI service ↛ database

The AI service has no database driver, no connection string, and no
credentials. All data it needs arrives over HTTP from `commerce-api`.

*Why:* the database enforces no business rules on its own. An agent with write
access could produce a cart the commerce layer considers impossible — a
negative quantity, an item priced at zero, an order that skipped validation.

### 4.2 AI service ↛ direct state mutation

The AI service emits intents; `commerce-api` executes them. The AI service
never holds authoritative cart or order state, and its conversation history is
explicitly not a cache of that state.

*Why:* two writers means two truths. When the agent's memory and the database
disagree — and they will, across retries, timeouts and parallel sessions — the
database must be the one that matters.

### 4.3 Frontend ↛ executing AI output

Agent output is untrusted input, not code. Concretely, in `apps/web`:

- Every UI command is parsed against a closed discriminated union. An unknown
  `type` is **dropped and logged**, never forwarded, never rendered.
- No `eval`, no `new Function`, no `dangerouslySetInnerHTML` fed from agent
  output, no dynamic `import()` of an agent-supplied path, no navigation to an
  agent-supplied URL without validation.
- Prices, totals, and availability shown to the user come from `commerce-api`
  responses. The agent may *say* "that comes to $12.50"; the number on screen
  comes from the backend, and the two are allowed to disagree visibly rather
  than have the frontend trust the agent.

*Why:* the agent is an input channel an end user can influence with natural
language. Anything it emits must be treated with the same suspicion as a
query parameter.

### 4.4 UI commands ≠ business intents

Two separate vocabularies, in two separate directories, with a hard rule
between them:

| | Business intent | UI command |
| --- | --- | --- |
| Answers | *What should happen to commerce state?* | *What should the screen do?* |
| Examples | `AddItemToCart`, `RemoveItem`, `ApplyPromotion`, `PlaceOrder` | `ShowMenuCategory`, `HighlightItem`, `OpenCartPanel`, `ShowUpsellPrompt` |
| Executed by | `commerce-api` | `apps/web` renderer |
| Lives in | `packages/contracts/agent-intents` | `packages/contracts/ui-commands` |
| May change cart or order state | Yes — that is its purpose | **Never** |

**The test:** if a UI command could change what the user is charged, it is an
intent wearing a costume. Move it.

*Why:* collapsing the two is the failure that makes every other boundary
decorative. Once the frontend can act on a command that mutates commerce
state, the agent has a write path that skips `commerce-api` validation.

## 5. Authority model

| State | Authoritative source | Everything else is |
| ----- | -------------------- | ------------------ |
| Menu, availability | `commerce-api` | a cache to be refreshed |
| Cart contents, quantities | `commerce-api` | a display of it |
| Prices, totals, discounts | `commerce-api` | never recomputed client-side or agent-side |
| Order status | `commerce-api` | a view |
| Payment state | `commerce-api` | a view |
| Conversation history | `ai-service` | context and explanation only — never state |

When frontend and backend disagree, the backend wins and the frontend
refreshes. This is stated three times in `CLAUDE.md`; it is treated here as
load-bearing rather than advisory.

## 6. Contracts

`packages/contracts` holds three schema families, each with exactly one
producer and one consumer pair:

| Directory | Produced by | Consumed by | Purpose |
| --------- | ----------- | ----------- | ------- |
| `ui-commands/` | `ai-service` | `apps/web` | What the screen should do |
| `agent-intents/` | `ai-service` | `commerce-api` | What should happen to commerce state |
| `api-contracts/` | `commerce-api` | `apps/web`, `ai-service` | Request/response shapes for the commerce API |

Authoring pipeline (ADR-0003): Zod schemas are the source of truth → JSON
Schema is generated → Pydantic models are generated for Python. No schema is
written twice by hand.

## 7. Deliberately absent

Per `CLAUDE.md`'s initial scope, and not by oversight: real AI model
integration, real voice provider, real payments, production authentication,
Kubernetes, production infrastructure, distributed tracing, multi-region.

`infrastructure/docker/` and `infrastructure/kubernetes/` exist as empty
directories. They should stay empty until a phase explicitly scopes them, and
any work inside them classifies as HIGH risk on the infrastructure dimension.

## 8. Known architectural gaps

Recorded rather than solved, because solving them is not Phase 0 work:

1. **The database is unchosen.** Early phases simulate it (ADR-0004,
   Proposed). The repository interface chosen there determines how painful the
   real one is to adopt.
2. **No mechanical enforcement of §4.1.** The AI service is forbidden from
   reaching the database by convention only. Credential separation or network
   policy would make it structural — appropriate later, premature now.
3. **Idempotency is named but undesigned.** `CLAUDE.md` requires it of
   `commerce-api`; the key strategy and retry semantics are undefined. This
   matters most where the AI service retries an intent after a timeout, which
   is exactly where a duplicate order comes from.
4. **Authorization boundaries are named but undesigned.** The system assumes a
   single user for now, so there is no subject to authorize. The shape of this
   changes materially once there is.
