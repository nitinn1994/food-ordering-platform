import {
  parseAgentTurnResponse,
  type BatchParseResult,
} from "@contracts/ui-commands";
import { request, type RequestDeps, type ResponseSchema } from "../api/client";
import { AGENT_TURN_PATH, BROWSER_AI_BASE } from "../api/config";

// ai-service's POST /v1/agent/turns, through the same-origin proxy —
// docs/features/phase-15-ai-ui-commands/plan.md §10, §14. The only caller is
// ChatInput; like the cart and order services, this is the one place the
// turn's HTTP details live, and lib/api/client.ts does the HTTP.

// ai-service's worst-case turn is 8 tool calls at up to 3 s each; Next's
// rewrite proxy allows 30 s (plan.md §14, assumption A8).
export const AGENT_TURN_TIMEOUT_MS = 30_000;

export type AgentTurn = {
  // Untrusted wording, rendered as text only — never markup, never a price
  // anyone relies on (system-architecture.md §4.3).
  reply: string;
  // null when the turn carried no UI commands. Otherwise the batch as
  // parseBatch judged it: an accepted envelope with each command accepted or
  // rejected on its own, or a rejected envelope. Nothing here applies it.
  uiCommands: BatchParseResult | null;
};

// parseAgentTurnResponse in the shape request() validates with. A response
// that fails its outer object becomes ApiError{kind: "invalid-response"}; a
// bad batch or command does not — it is reported inside `uiCommands`, so the
// reply still reaches the customer (plan.md §16).
const agentTurnSchema: ResponseSchema<AgentTurn> = {
  safeParse(value) {
    const result = parseAgentTurnResponse(value);
    return result.accepted
      ? {
          success: true,
          data: { reply: result.reply, uiCommands: result.uiCommands },
        }
      : { success: false };
  },
};

// Never retried: a turn may already have changed the cart through ai-service's
// tools, and a retried "add" would add twice (system-architecture.md §8 gap 3).
export function sendAgentTurn(
  message: string,
  deps: RequestDeps = {},
): Promise<AgentTurn> {
  return request(
    {
      method: "POST",
      path: AGENT_TURN_PATH,
      body: { message },
      schema: agentTurnSchema,
      timeoutMs: AGENT_TURN_TIMEOUT_MS,
      retry: false,
    },
    { ...deps, baseUrl: deps.baseUrl ?? BROWSER_AI_BASE },
  );
}
