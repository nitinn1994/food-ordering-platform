"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MAX_TURN_MESSAGE_LENGTH } from "@contracts/ui-commands";
import { useSharedAgentTurn } from "../../lib/agent/AgentTurnProvider";
import type { AgentTurn } from "../../lib/agent/useAgentTurn";
import { resolveNudgeReply } from "../../lib/nudges/nudgeReply";
import { useNudgeSession } from "../../lib/nudges/NudgeProvider";
import { createBrowserSpeechToText } from "../../lib/voice/browserSpeechToText";
import { createBrowserTextToSpeech } from "../../lib/voice/browserTextToSpeech";
import type { SpeechToText, TextToSpeech } from "../../lib/voice/types";
import { useVoiceSession, type VoiceSubmit } from "../../lib/voice/useVoiceSession";
import {
  VOICE_DISCLOSURE,
  VOICE_ERROR_MESSAGES,
  VOICE_STATUS_MESSAGES,
} from "../../lib/voice/voiceMessages";
import styles from "./VoiceShell.module.css";

// The voice-first shell (docs/features/mcdelivery-redesign/plan.md,
// Phase 5). One voice session for the whole page, opened from the header
// microphone (every route) or the floating button (narrow screens), shown
// in a sheet. It changes how voice is *reached*, not what it is: the same
// browser adapters, the same state machine (useVoiceSession / voiceReducer)
// and the same shared turn (AgentTurnProvider) as ADR-0023 — tap-to-talk,
// the 15 s cap, barge-in and the disclosure before the first press are all
// unchanged.
//
// The one addition: right after the assistant has *spoken* a suggestion, a
// short "yes" or "no" is answered here as that suggestion's Add or
// No thanks (nudgeReply.ts, requirements.md AC-V4) — one utterance only.

export type VoiceAdapters = { stt: SpeechToText; tts: TextToSpeech };

type VoiceShellValue = {
  // null while the browser's speech support is still being detected.
  supported: boolean | null;
  open: (opener: HTMLElement | null) => void;
};

const VoiceShellContext = createContext<VoiceShellValue | null>(null);

// null outside the shell: a component rendered alone (as in the Phase 16
// tests) keeps its own inline voice control.
export function useVoiceShell(): VoiceShellValue | null {
  return useContext(VoiceShellContext);
}

const NOT_READY: VoiceShellValue = { supported: null, open: () => undefined };
const UNSUPPORTED: VoiceShellValue = { supported: false, open: () => undefined };

export function VoiceShell({
  children,
  adapters,
}: {
  children: ReactNode;
  // Injected by tests; the browser's own speech APIs otherwise.
  adapters?: VoiceAdapters;
}) {
  const turn = useSharedAgentTurn();
  // Detected after mount, never during render (the server has no speech
  // APIs) — the same rule as VoiceControl.
  const [detected, setDetected] = useState<VoiceAdapters | null>(adapters ?? null);
  useEffect(() => {
    if (!adapters) {
      setDetected({ stt: createBrowserSpeechToText(), tts: createBrowserTextToSpeech() });
    }
  }, [adapters]);
  const active = adapters ?? detected;

  if (turn === null) {
    throw new Error("VoiceShell must be used within an AgentTurnProvider");
  }
  if (active === null) {
    return <VoiceShellContext.Provider value={NOT_READY}>{children}</VoiceShellContext.Provider>;
  }
  if (!active.stt.isSupported) {
    // No microphone anywhere; the chat says to type instead (AC-V5).
    return <VoiceShellContext.Provider value={UNSUPPORTED}>{children}</VoiceShellContext.Provider>;
  }
  return (
    <ActiveVoiceShell stt={active.stt} tts={active.tts} turn={turn}>
      {children}
    </ActiveVoiceShell>
  );
}

const INTRODUCED_KEY = "voice-introduced:v1";
const SUGGESTED_PROMPTS = ["Find burger", "Open my cart", "What can you do?"];

function readIntroduced(): boolean {
  try {
    return window.sessionStorage.getItem(INTRODUCED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeIntroduced(): void {
  try {
    window.sessionStorage.setItem(INTRODUCED_KEY, "true");
  } catch {
    // Not remembered: the intro shows again next time. Harmless.
  }
}

function ActiveVoiceShell({
  children,
  stt,
  tts,
  turn,
}: {
  children: ReactNode;
  stt: SpeechToText;
  tts: TextToSpeech;
  turn: AgentTurn;
}) {
  const nudges = useNudgeSession();
  const [open, setOpen] = useState(false);
  // The first visit shows the disclosure and an explicit "Start talking":
  // the microphone (and the browser's permission prompt) is never reached
  // before the disclosure has been on screen (ADR-0023 rule 4).
  const [introduced, setIntroduced] = useState(readIntroduced);
  const [exchange, setExchange] = useState<{ heard: string; reply: string } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const micButton = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  const submit: VoiceSubmit = (text) => {
    const offered = nudges.takeSpokenNudge();
    if (offered !== null) {
      const answer = resolveNudgeReply(text);
      if (answer !== "other") {
        // The same effect as pressing the toast's button: the customer's
        // own add-to-cart, or No thanks. Fixed copy, nothing invented.
        const result = answer === "accept" ? offered.accept() : offered.dismiss();
        let reply: string | null = null;
        if (result === "busy") {
          // Nothing was done; the offer still stands for one more try.
          nudges.setSpokenNudge(offered);
          reply = "One moment — your cart is still updating. Try again in a second.";
        } else if (result === "done") {
          reply =
            answer === "accept"
              ? `Adding ${offered.itemName} to your cart.`
              : `Okay, no ${offered.itemName}.`;
        }
        // "gone": the suggestion is no longer on screen — an ordinary turn.
        if (reply !== null) {
          setExchange({ heard: text, reply });
          return Promise.resolve({ reply, failed: false });
        }
      }
    }
    const running = turn.submit(text);
    if (running === null) {
      // Not sent (a typed turn is in flight): the offer still stands.
      if (offered !== null) nudges.setSpokenNudge(offered);
      return null;
    }
    return running.then((outcome) => {
      setExchange({ heard: text, reply: outcome.reply });
      return outcome;
    });
  };

  const voice = useVoiceSession({ stt, tts, submit, maxLength: MAX_TURN_MESSAGE_LENGTH });

  // Any turn that starts — typed, tapped or spoken — ends the window for a
  // spoken "yes" (requirements.md AC-V4: one utterance; review #2).
  useEffect(() => {
    if (turn.pending) nudges.setSpokenNudge(null);
  }, [turn.pending, nudges]);
  const { status, interim, muted, error } = voice.state;
  const listening = status === "listening";

  const openSheet = useCallback(
    (from: HTMLElement | null) => {
      opener.current = from;
      setOpen(true);
      // Introduced: the press that opened the sheet is the press to talk.
      if (readIntroduced()) voice.start();
    },
    // Stable on purpose: the context value must not change every render.
    // The first render's voice.start is safe to keep — it reads only refs.
    [],
  );

  function close() {
    if (voice.state.status === "listening") voice.stopListening();
    if (voice.state.status === "speaking") voice.stopSpeaking();
    setOpen(false);
    opener.current?.focus();
  }

  useEffect(() => {
    if (open) micButton.current?.focus();
  }, [open]);

  const value = useMemo<VoiceShellValue>(() => ({ supported: true, open: openSheet }), [openSheet]);
  const statusText = error
    ? VOICE_ERROR_MESSAGES[error]
    : VOICE_STATUS_MESSAGES[status === "error" ? "idle" : status];

  return (
    <VoiceShellContext.Provider value={value}>
      {children}
      {!open && (
        <button
          type="button"
          className={styles.fab}
          aria-label="Talk to order"
          onClick={(event) => openSheet(event.currentTarget)}
        >
          <MicIcon />
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={styles.sheet}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              Order by voice
            </h2>
            <button type="button" className={styles.close} aria-label="Close voice" onClick={close}>
              ×
            </button>
          </div>
          <p className={styles.disclosure}>{VOICE_DISCLOSURE}</p>
          {!introduced && (
            <p className={styles.intro}>
              Tap <strong>Start talking</strong>, then say what you&apos;d like — for example
              “add fries”. Tap again to stop.
            </p>
          )}
          <div className={styles.controls}>
            <button
              ref={micButton}
              type="button"
              className={listening ? `${styles.mic} ${styles.listening}` : styles.mic}
              disabled={status === "processing" || (turn.pending && !listening)}
              onClick={() => {
                if (listening) {
                  voice.stopListening();
                  return;
                }
                if (!introduced) {
                  writeIntroduced();
                  setIntroduced(true);
                }
                voice.start();
              }}
            >
              <MicIcon />
              {listening ? "Stop listening" : "Start talking"}
            </button>
            {status === "processing" && (
              <button type="button" onClick={voice.mute} disabled={muted}>
                Don&apos;t read reply aloud
              </button>
            )}
            {status === "speaking" && (
              <button type="button" onClick={voice.stopSpeaking}>
                Stop speaking
              </button>
            )}
          </div>
          {listening && (
            // Shown as text and shape, not colour alone (ADR-0023).
            <p className={styles.recording} aria-hidden="true">
              ● Recording
            </p>
          )}
          <p role="status" className={styles.status}>
            {statusText}
          </p>
          {listening && interim && <p className={styles.interim}>{interim}</p>}
          {exchange !== null && (
            <div className={styles.exchange}>
              <p>
                <span className={styles.who}>You</span> {exchange.heard}
              </p>
              <p>
                <span className={styles.who}>Assistant</span> {exchange.reply}
              </p>
            </div>
          )}
          <div className={styles.prompts} role="group" aria-label="Try saying">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className={styles.prompt}
                disabled={turn.pending || listening}
                onClick={() => {
                  // A tap, not speech: through the same turn, never spoken.
                  const running = turn.submit(prompt);
                  void running?.then((outcome) =>
                    setExchange({ heard: prompt, reply: outcome.reply }),
                  );
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </VoiceShellContext.Provider>
  );
}

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The header's microphone: on every route, when the browser can listen.
export function VoiceLauncher({ className }: { className?: string }) {
  const shell = useVoiceShell();
  if (shell === null || shell.supported !== true) {
    return null;
  }
  return (
    <button
      type="button"
      className={className}
      aria-label="Talk to order"
      onClick={(event) => shell.open(event.currentTarget)}
    >
      <MicIcon />
      <span aria-hidden="true">Talk</span>
    </button>
  );
}
