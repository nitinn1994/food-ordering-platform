"use client";

import { useState, type FormEvent } from "react";
import { simulateCommand } from "../../lib/commands/simulate";
import { dispatchCommand } from "../../lib/commands/dispatch";
import { useUi, type UiAction } from "../../lib/state/uiStore";
import { ChatTranscript, type ChatMessage } from "./ChatTranscript";
import styles from "./ChatInput.module.css";

// Exhaustive over UiAction["type"] — adding a new command without a matching
// entry here is now a compile error, not a silent wrong message. This bug
// class already shipped twice (Phase 1's dead-state finding, and a second
// instance caught during Phase 2.4) before this table existed.
const OUTCOME_MESSAGES: Record<UiAction["type"], string> = {
  SELECT_CATEGORY: "Here's that category.",
  HIGHLIGHT_ITEM: "Highlighting that item.",
  SET_CART_PANEL_OPEN: "Opening your cart.",
  SHOW_ITEM_DETAIL: "Here are the details.",
  SET_SEARCH_QUERY: "Here's what I found.",
  // Never actually reaches here — dispatchCommand's uiAction comes from
  // commandToUiAction, which never returns LOG_COMMAND (see dispatch.ts).
  // Present only so this table stays exhaustive over the full UiAction union.
  LOG_COMMAND: "Sorry, I couldn't apply that command.",
};

function describeOutcome(uiActionType: UiAction["type"] | null): string {
  if (uiActionType === null) {
    return "Sorry, I couldn't apply that command.";
  }
  return OUTCOME_MESSAGES[uiActionType];
}

export function ChatInput() {
  const ui = useUi();
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const utterance = draft.trim();
    if (!utterance) {
      return;
    }

    setTranscript((prev) => [...prev, { role: "user", text: utterance }]);
    setDraft("");

    const raw = simulateCommand(utterance);
    if (raw === undefined) {
      setTranscript((prev) => [
        ...prev,
        { role: "assistant", text: "I didn't catch a command in that." },
      ]);
      return;
    }

    const { entry, uiAction } = dispatchCommand(raw);
    ui.logCommand(entry);
    if (uiAction) {
      ui.applyUiAction(uiAction);
    }

    setTranscript((prev) => [
      ...prev,
      { role: "assistant", text: describeOutcome(uiAction?.type ?? null) },
    ]);
  }

  return (
    <div className={styles.chat}>
      <ChatTranscript messages={transcript} />
      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder='Try "show me the desserts"'
          aria-label="Chat message"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
