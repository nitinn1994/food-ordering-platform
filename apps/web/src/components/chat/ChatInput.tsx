"use client";

import { useRef, useState, type FormEvent } from "react";
import { MAX_TURN_MESSAGE_LENGTH } from "@contracts/ui-commands";
import { sendAgentTurn } from "../../lib/agent/agentService";
import { userMessageFor } from "../../lib/api/userMessages";
import { dispatchBatch, type DispatchResult } from "../../lib/commands/dispatch";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { ChatTranscript, type ChatMessage } from "./ChatTranscript";
import styles from "./ChatInput.module.css";

// The chat, talking to ai-service — docs/features/phase-15-ai-ui-commands/
// plan.md §15, §16. One turn is one request; its reply is shown as text and
// its UI commands, once validated, change only uiStore. The cart is never
// taken from the turn: after every turn, success or failure, it is re-read
// from commerce-api *before* any command is applied, so an OpenCartPanel
// opens onto the cart commerce-api has just confirmed (plan.md §19,
// ADR-0005). Only refresh() — a read — is used from the cart; UI commands
// still cannot reach cart state (lib/commands/dispatch.ts).
export function ChatInput() {
  const ui = useUi();
  const cart = useCart();
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  // Guards synchronously, unlike `pending`: two submits in the same frame
  // both see pending === false, but not this ref (plan.md AC16).
  const inFlight = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const utterance = draft.trim();
    if (!utterance || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    setTranscript((prev) => [...prev, { role: "user", text: utterance }]);
    setDraft("");

    try {
      let reply: string;
      let steps: DispatchResult[] = [];
      try {
        const turn = await sendAgentTurn(utterance);
        reply = turn.reply;
        steps = dispatchBatch(turn.uiCommands);
      } catch (error) {
        // Fixed copy chosen by kind/code, never the backend's message. Never
        // retried: the turn may already have changed the cart.
        reply = userMessageFor(error, "agent");
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
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className={styles.chat}>
      <ChatTranscript messages={transcript} />
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className={styles.form}
        aria-busy={pending}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder='Try "show me the desserts"'
          aria-label="Chat message"
          maxLength={MAX_TURN_MESSAGE_LENGTH}
          disabled={pending}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
