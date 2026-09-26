import { z } from "zod";
import { uiCommandBatchSchema } from "./envelope";
import { parseBatch, type BatchParseResult } from "./parse";

// One conversational turn between apps/web and ai-service's
// POST /v1/agent/turns — docs/features/phase-15-ai-ui-commands/plan.md §7,
// §11. Authored here, not in Python, so both languages share one definition
// (ADR-0003): ai-service generates its Pydantic models from the JSON Schema
// this package emits.
//
// It lives in ui-commands because the response *is* the AI → web payload
// (plan.md OD4). commerce-api is already barred from importing this package,
// so the turn contract inherits that boundary for free.
//
// There is deliberately no intent field anywhere in a turn: business
// intents never leave ai-service towards the frontend (system-architecture.md
// §4.4, ADR-0012 D11).

// ai-service's existing bounds (schemas/agent.py MAX_TURN_MESSAGE_LENGTH,
// agents/service.py MAX_REPLY_LENGTH), moved here unchanged so the wire rules
// stay what they were.
export const MAX_TURN_MESSAGE_LENGTH = 2000;
export const MAX_TURN_REPLY_LENGTH = 4000;

// At least one non-whitespace character (Phase 13 OD9).
export const agentTurnRequestSchema = z.strictObject({
  message: z.string().min(1).max(MAX_TURN_MESSAGE_LENGTH).regex(/\S/),
});

// uiCommands is omitted, never null, when a turn produced no commands
// (plan.md OD12) — the batch envelope itself requires at least one command.
export const agentTurnResponseSchema = z.strictObject({
  reply: z.string().min(1).max(MAX_TURN_REPLY_LENGTH),
  uiCommands: uiCommandBatchSchema.optional(),
});

export type AgentTurnRequest = z.infer<typeof agentTurnRequestSchema>;
export type AgentTurnResponse = z.infer<typeof agentTurnResponseSchema>;

// Stage one of parseAgentTurnResponse: the outer object strictly, with
// uiCommands left unvalidated so parseBatch can judge it on its own. Parsing
// the whole response with agentTurnResponseSchema would reject a turn — reply
// included — because one command inside it was malformed, which is the
// opposite of "dropped and logged" (system-architecture.md §4.3).
const turnEnvelopeSchema = z.strictObject({
  reply: agentTurnResponseSchema.shape.reply,
  uiCommands: z.unknown().optional(),
});

export type AgentTurnParseResult =
  | {
      accepted: true;
      reply: string;
      // null when the response carried no uiCommands at all.
      uiCommands: BatchParseResult | null;
    }
  | { accepted: false; reason: string; received: unknown };

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

// Three levels, each failing only what it owns (plan.md §10, §16):
//   - a malformed outer object (unknown key, bad reply) rejects the response;
//   - a malformed batch envelope rejects every command but keeps the reply;
//   - a malformed command rejects only itself (parseBatch).
// Never throws.
export function parseAgentTurnResponse(input: unknown): AgentTurnParseResult {
  const result = turnEnvelopeSchema.safeParse(input);

  if (!result.success) {
    return {
      accepted: false,
      reason: formatIssues(result.error),
      received: input,
    };
  }

  const { reply, uiCommands } = result.data;
  return {
    accepted: true,
    reply,
    uiCommands:
      uiCommands === undefined ? null : parseBatch(uiCommands),
  };
}
