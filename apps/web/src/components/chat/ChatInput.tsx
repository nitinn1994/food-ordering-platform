"use client";

import { useState, type FormEvent } from "react";
import { MAX_TURN_MESSAGE_LENGTH } from "@contracts/ui-commands";
import { useAgentTurn, type AgentTurn } from "../../lib/agent/useAgentTurn";
import { useSharedAgentTurn } from "../../lib/agent/AgentTurnProvider";
import { VOICE_UNSUPPORTED_HINT } from "../../lib/voice/voiceMessages";
import { useVoiceShell } from "../voice/VoiceShell";
import { VoiceControl, type VoiceAdapters } from "../voice/VoiceControl";
import { ChatTranscript } from "./ChatTranscript";
import styles from "./ChatInput.module.css";

// The chat, talking to ai-service — docs/features/phase-15-ai-ui-commands/
// plan.md §15, §16. The turn itself (send, cart re-read, reply, UI commands,
// one turn in flight) lives in useAgentTurn, shared with voice since Phase 16
// (docs/features/phase-16-voice-interaction/plan.md §3); this component owns
// only the text form, and renders the voice control beside it, which submits
// through the same turn. `voice` is injected by tests only; the browser's own
// speech APIs are used otherwise.
export function ChatInput({ voice }: { voice?: VoiceAdapters } = {}) {
  // mcdelivery-redesign Phase 5: inside the app the turn is the app-wide
  // one (AgentTurnProvider), shared with the header's voice sheet; rendered
  // alone, ChatInput keeps its own, exactly as before.
  const shared = useSharedAgentTurn();
  return shared ? (
    <ChatInputView turn={shared} voice={voice} />
  ) : (
    <ChatInputWithOwnTurn voice={voice} />
  );
}

function ChatInputWithOwnTurn({ voice }: { voice?: VoiceAdapters }) {
  const turn = useAgentTurn();
  return <ChatInputView turn={turn} voice={voice} />;
}

function ChatInputView({ turn, voice }: { turn: AgentTurn; voice?: VoiceAdapters }) {
  // With the voice shell mounted, the one microphone is the header's
  // (one voice session per page); the chat only points to it.
  const voiceShell = useVoiceShell();
  const [draft, setDraft] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const running = turn.submit(draft);
    if (!running) {
      return;
    }
    setDraft("");
    await running;
  }

  return (
    <div className={styles.chat}>
      <ChatTranscript messages={turn.transcript} />
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className={styles.form}
        aria-busy={turn.pending}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder='Try "show me the desserts"'
          aria-label="Chat message"
          maxLength={MAX_TURN_MESSAGE_LENGTH}
          disabled={turn.pending}
        />
        <button type="submit" disabled={turn.pending}>
          {turn.pending ? "Sending…" : "Send"}
        </button>
      </form>
      {voiceShell === null ? (
        <VoiceControl submit={turn.submit} disabled={turn.pending} adapters={voice} />
      ) : (
        <p className={styles.voiceHint}>
          {voiceShell.supported === null
            ? null
            : voiceShell.supported
              ? "Prefer to talk? Tap the microphone at the top."
              : VOICE_UNSUPPORTED_HINT}
        </p>
      )}
    </div>
  );
}
