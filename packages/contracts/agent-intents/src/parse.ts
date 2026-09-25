import type { z } from "zod";
import { agentIntentSchema, type AgentIntent } from "./intents";
import { agentIntentRequestSchema, type AgentIntentRequest } from "./envelope";

// Same result shape as @contracts/ui-commands' ParseResult, deliberately —
// one vocabulary for "did this parse" across both contract families.
export type IntentParseResult =
  | { accepted: true; intent: AgentIntent }
  | { accepted: false; reason: string; received: unknown };

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

// Validates a single intent, on its own — the same granularity parseCommand
// validates a single UI command at. Never throws; a rejection is an
// ordinary value the caller must handle.
export function parseIntent(input: unknown): IntentParseResult {
  const result = agentIntentSchema.safeParse(input);

  if (result.success) {
    return { accepted: true, intent: result.data };
  }

  return {
    accepted: false,
    reason: formatIssues(result.error),
    received: input,
  };
}

export type IntentRequestParseResult =
  | { accepted: true; request: AgentIntentRequest }
  | { accepted: false; reason: string; received: unknown };

// Validates the whole request — envelope metadata and the one intent it
// carries — as a single unit. Unlike parseBatch in ui-commands, there is no
// partial-acceptance case to preserve: a request carries exactly one
// intent, so there is nothing to salvage from a malformed one.
export function parseIntentRequest(input: unknown): IntentRequestParseResult {
  const result = agentIntentRequestSchema.safeParse(input);

  if (result.success) {
    return { accepted: true, request: result.data };
  }

  return {
    accepted: false,
    reason: formatIssues(result.error),
    received: input,
  };
}
