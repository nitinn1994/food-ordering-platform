"use client";

import { useRef, useState } from "react";
import { userMessageFor } from "../api/userMessages";
import { dispatchBatch, type DispatchResult } from "../commands/dispatch";
import { useCart } from "../state/cartStore";
import { useUi } from "../state/uiStore";
import { sendAgentTurn } from "./agentService";

// One conversational turn, shared by every input channel — typed text and,
// since Phase 16, a voice transcript (docs/features/phase-16-voice-
// interaction/plan.md §3, AC1). Extracted unchanged from ChatInput
// (docs/features/phase-15-ai-ui-commands/plan.md §15, §16): one turn is one
// request; its reply is shown as text and its UI commands, once validated,
// change only uiStore. The cart is never taken from the turn: after every
// turn, success or failure, it is re-read from commerce-api *before* any
// command is applied, so an OpenCartPanel opens onto the cart commerce-api
// has just confirmed (plan.md §19, ADR-0005). Only refresh() — a read — is
// used from the cart; UI commands still cannot reach cart state
// (lib/commands/dispatch.ts).

// One line of the chat transcript, rendered by ChatTranscript as text only.
export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type AgentTurnOutcome = {
  // What was added to the transcript as the assistant's line: the reply, or
  // fixed failure copy.
  reply: string;
  // True when the turn failed and `reply` is failure copy — a caller that
  // speaks replies does not speak it (Phase 16 plan.md §19).
  failed: boolean;
};

export type AgentTurn = {
  transcript: ChatMessage[];
  pending: boolean;
  // Starts a turn for `text` (trimmed). Returns null, synchronously, when
  // nothing was sent: the text is empty, or a turn is already in flight.
  // Otherwise resolves once the reply is shown and its commands applied.
  submit: (text: string) => Promise<AgentTurnOutcome> | null;
};

export function useAgentTurn(): AgentTurn {
  const ui = useUi();
  const cart = useCart();
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  // Guards synchronously, unlike `pending`: two submits in the same frame
  // both see pending === false, but not this ref (Phase 15 AC16). Shared by
  // every channel, so only one turn is in flight at a time (Phase 16 AC4).
  const inFlight = useRef(false);

  async function run(utterance: string): Promise<AgentTurnOutcome> {
    try {
      let reply: string;
      let failed = false;
      let steps: DispatchResult[] = [];
      try {
        const turn = await sendAgentTurn(utterance);
        reply = turn.reply;
        steps = dispatchBatch(turn.uiCommands);
      } catch (error) {
        // Fixed copy chosen by kind/code, never the backend's message. Never
        // retried: the turn may already have changed the cart.
        reply = userMessageFor(error, "agent");
        failed = true;
      }

      // Even a failed turn may have changed the cart before it failed
      // (docs/api/ai-service.md §3.1), so the cart is always re-read.
      await cart.refresh();

      setTranscript((prev) => [...prev, { role: "assistant", text: reply }]);
      for (const { entry, uiAction } of steps) {
        ui.logCommand(entry);
        if (uiAction) {
          ui.applyUiAction(uiAction);
        }
      }
      return { reply, failed };
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function submit(text: string): Promise<AgentTurnOutcome> | null {
    const utterance = text.trim();
    if (!utterance || inFlight.current) {
      return null;
    }
    inFlight.current = true;
    setPending(true);
    setTranscript((prev) => [...prev, { role: "user", text: utterance }]);
    return run(utterance);
  }

  return { transcript, pending, submit };
}
