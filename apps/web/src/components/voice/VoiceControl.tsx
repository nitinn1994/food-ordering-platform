"use client";

import { useEffect, useState } from "react";
import { MAX_TURN_MESSAGE_LENGTH } from "@contracts/ui-commands";
import { createBrowserSpeechToText } from "../../lib/voice/browserSpeechToText";
import { createBrowserTextToSpeech } from "../../lib/voice/browserTextToSpeech";
import type { SpeechToText, TextToSpeech } from "../../lib/voice/types";
import { useVoiceSession, type VoiceSubmit } from "../../lib/voice/useVoiceSession";
import {
  VOICE_DISCLOSURE,
  VOICE_ERROR_MESSAGES,
  VOICE_STATUS_MESSAGES,
  VOICE_UNSUPPORTED_HINT,
} from "../../lib/voice/voiceMessages";
import styles from "./VoiceControl.module.css";

// Voice input and spoken replies for the chat — docs/features/phase-16-voice-
// interaction/plan.md §18, §21. Voice is another way to produce the chat's
// message and to hear its reply: `submit` is the chat's own shared turn
// (useAgentTurn), so a spoken request goes through exactly the path a typed
// one does, and its reply is shown and its UI commands applied before it is
// spoken. This component holds presentation/session state only.

export type VoiceAdapters = {
  stt: SpeechToText;
  tts: TextToSpeech;
};

type VoiceControlProps = {
  submit: VoiceSubmit;
  // True while a turn from any channel is in flight (plan.md AC4).
  disabled: boolean;
  // Injected by tests; the browser's own speech APIs otherwise.
  adapters?: VoiceAdapters;
};

export function VoiceControl({ submit, disabled, adapters }: VoiceControlProps) {
  // Detected after mount, never during render: the server has no speech
  // APIs, so rendering from them would not match the first client render.
  const [detected, setDetected] = useState<VoiceAdapters | null>(adapters ?? null);
  useEffect(() => {
    if (!adapters) {
      setDetected({ stt: createBrowserSpeechToText(), tts: createBrowserTextToSpeech() });
    }
  }, [adapters]);

  const active = adapters ?? detected;
  if (!active) {
    return null;
  }
  if (!active.stt.isSupported) {
    // Not a disabled button: say why, and point at the text box (AC16).
    return <p className={styles.hint}>{VOICE_UNSUPPORTED_HINT}</p>;
  }
  return <VoicePanel submit={submit} disabled={disabled} stt={active.stt} tts={active.tts} />;
}

function VoicePanel({
  submit,
  disabled,
  stt,
  tts,
}: {
  submit: VoiceSubmit;
  disabled: boolean;
  stt: SpeechToText;
  tts: TextToSpeech;
}) {
  const voice = useVoiceSession({ stt, tts, submit, maxLength: MAX_TURN_MESSAGE_LENGTH });
  const { status, interim, muted, error } = voice.state;
  const listening = status === "listening";

  const statusText = error ? VOICE_ERROR_MESSAGES[error] : VOICE_STATUS_MESSAGES[status === "error" ? "idle" : status];

  return (
    <div className={styles.voice}>
      {/* Visible before the first press, which is when the browser first
          asks for the microphone (plan.md OD2, AC17). */}
      <p className={styles.disclosure}>{VOICE_DISCLOSURE}</p>
      <div className={styles.controls}>
        <button
          type="button"
          className={listening ? `${styles.mic} ${styles.recording}` : styles.mic}
          disabled={status === "processing" || (disabled && !listening)}
          onClick={listening ? voice.stopListening : voice.start}
        >
          <span aria-hidden="true">{listening ? "🎙" : "🎤"}</span>{" "}
          {listening ? "Stop listening" : "Start voice input"}
        </button>
        {listening && (
          // Recording is shown as text and shape, not colour alone (AC15).
          <span className={styles.recordingLabel} aria-hidden="true">
            ● Recording
          </span>
        )}
        {status === "processing" && (
          <button type="button" onClick={voice.mute} disabled={muted}>
            Don't read reply aloud
          </button>
        )}
        {status === "speaking" && (
          <button type="button" onClick={voice.stopSpeaking}>
            <span aria-hidden="true">🔊</span> Stop speaking
          </button>
        )}
      </div>
      {/* One polite announcement per change; the interim text is kept out
          of it so a screen reader is not flooded while listening. */}
      <p role="status" className={styles.status}>
        {statusText}
      </p>
      {listening && interim && <p className={styles.interim}>{interim}</p>}
    </div>
  );
}
