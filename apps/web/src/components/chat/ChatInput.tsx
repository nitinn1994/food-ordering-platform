"use client";

import { useState, type FormEvent } from "react";
import { simulateCommand } from "../../lib/commands/simulate";
import { dispatchCommand } from "../../lib/commands/dispatch";
import { useUi } from "../../lib/state/uiStore";
import { ChatTranscript, type ChatMessage } from "./ChatTranscript";
import styles from "./ChatInput.module.css";

function describeOutcome(uiActionType: string | null): string {
  switch (uiActionType) {
    case "SELECT_CATEGORY":
      return "Here's that category.";
    case "HIGHLIGHT_ITEM":
      return "Highlighting that item.";
    case "SET_CART_PANEL_OPEN":
      return "Opening your cart.";
    default:
      return "Sorry, I couldn't apply that command.";
  }
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
