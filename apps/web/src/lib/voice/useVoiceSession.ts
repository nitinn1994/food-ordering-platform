"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_LISTEN_MS, VOICE_LANG, type RecognitionHandle, type SpeechHandle, type SpeechToText, type TextToSpeech } from "./types";
import { INITIAL_VOICE_STATE, voiceReducer, type VoiceEvent, type VoiceState } from "./voiceReducer";

// One voice session — docs/features/phase-16-voice-interaction/plan.md §8–§11.
// It joins the state machine (voiceReducer), the two adapters, and the
// caller's `submit`, which is the shared text turn (useAgentTurn). Voice
// never talks to ai-service itself: an accepted final transcript is handed
// to `submit` exactly as typed text is, and only the resulting reply comes
// back, to be spoken. lib/voice cannot import the turn (eslint.config.mjs),
// so the caller passes it in, together with the contract's message limit.

// The shared turn, as voice sees it: null when nothing was sent (a turn is
// already in flight), otherwise the reply once it is shown and its UI
// commands applied. `failed` replies are fixed failure copy and are not
// spoken (plan.md §19).
export type VoiceSubmit = (text: string) => Promise<{ reply: string; failed: boolean }> | null;

export type VoiceSessionOptions = {
  stt: SpeechToText;
  tts: TextToSpeech;
  submit: VoiceSubmit;
  // MAX_TURN_MESSAGE_LENGTH, from the caller (lib/voice cannot import
  // contracts). A longer transcript is not sent (AC7).
  maxLength: number;
};

export type VoiceSession = {
  state: VoiceState;
  // Start listening. While speaking, this is barge-in: playback stops first
  // (AC11). Ignored while listening or processing.
  start: () => void;
  // Stop listening; a final result the browser already has is still used.
  stopListening: () => void;
  // Stop while processing: the turn is never aborted — it may already have
  // changed the cart — its reply is shown but not spoken (AC12).
  mute: () => void;
  stopSpeaking: () => void;
};

export function useVoiceSession(options: VoiceSessionOptions): VoiceSession {
  const [state, setState] = useState<VoiceState>(INITIAL_VOICE_STATE);
  // The current state, synchronously: adapter callbacks and the turn's
  // promise check it for staleness before acting.
  const stateRef = useRef<VoiceState>(INITIAL_VOICE_STATE);
  // The latest options: `submit` is a new function on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const recognition = useRef<RecognitionHandle | null>(null);
  const speech = useRef<SpeechHandle | null>(null);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  // The reply waiting to be spoken once "speaking" has rendered (below).
  const pendingReply = useRef<{ turnId: number; reply: string } | null>(null);

  function apply(event: VoiceEvent): VoiceState {
    const next = voiceReducer(stateRef.current, event);
    if (next !== stateRef.current) {
      stateRef.current = next;
      if (mounted.current) {
        setState(next);
      }
    }
    return next;
  }

  function clearListenTimer() {
    if (listenTimer.current !== null) {
      clearTimeout(listenTimer.current);
      listenTimer.current = null;
    }
  }

  function speak(turnId: number, reply: string) {
    speech.current = optionsRef.current.tts.speak(reply, {
      lang: VOICE_LANG,
      onEnd: () => apply({ type: "SPOKEN", turnId }),
      onError: () => apply({ type: "PLAYBACK_ERROR", turnId }),
    });
  }

  function acceptFinal(recognitionId: number, heard: string) {
    const current = stateRef.current;
    if (current.status !== "listening" || current.recognitionId !== recognitionId) {
      return;
    }
    clearListenTimer();
    const text = heard.trim();
    if (!text) {
      apply({ type: "RECOGNITION_ERROR", recognitionId, kind: "no-speech" });
      return;
    }
    if (text.length > optionsRef.current.maxLength) {
      apply({ type: "RECOGNITION_ERROR", recognitionId, kind: "too-long" });
      return;
    }

    // Submitted while still listening, so a refusal can still be reported:
    // a typed turn sent while the microphone was listening holds the one
    // in-flight slot, and the utterance must not vanish silently (review
    // finding 1).
    const running = optionsRef.current.submit(text);
    if (running === null) {
      apply({ type: "RECOGNITION_ERROR", recognitionId, kind: "busy" });
      return;
    }
    const { turnId } = apply({ type: "FINAL", recognitionId });
    running.then(
      (outcome) => {
        const canSpeak = !outcome.failed && optionsRef.current.tts.isSupported && mounted.current;
        pendingReply.current = canSpeak ? { turnId, reply: outcome.reply } : null;
        apply({ type: "REPLY", turnId, speak: canSpeak });
      },
      () => apply({ type: "REPLY", turnId, speak: false }),
    );
  }

  function start() {
    const current = stateRef.current;
    if (current.status === "listening" || current.status === "processing") {
      return;
    }
    pendingReply.current = null;
    if (current.status === "speaking") {
      speech.current?.cancel();
      speech.current = null;
    }
    const next = apply({ type: "START" });
    if (next.status !== "listening") {
      return;
    }
    const { recognitionId } = next;
    clearListenTimer();
    recognition.current = optionsRef.current.stt.start({
      lang: VOICE_LANG,
      onInterim: (text) => apply({ type: "INTERIM", recognitionId, text }),
      onFinal: (text) => acceptFinal(recognitionId, text),
      onError: (kind) => {
        if (stateRef.current.recognitionId === recognitionId) {
          clearListenTimer();
        }
        apply({ type: "RECOGNITION_ERROR", recognitionId, kind });
      },
      onEnd: () => {
        if (stateRef.current.recognitionId === recognitionId) {
          clearListenTimer();
          recognition.current = null;
        }
        apply({ type: "RECOGNITION_END", recognitionId });
      },
    });
    // The safety cap (AC13): stop — not abort — so whatever the browser
    // heard is still used.
    if (stateRef.current.status === "listening" && stateRef.current.recognitionId === recognitionId) {
      listenTimer.current = setTimeout(() => {
        listenTimer.current = null;
        const latest = stateRef.current;
        if (latest.status === "listening" && latest.recognitionId === recognitionId) {
          recognition.current?.stop();
        }
      }, MAX_LISTEN_MS);
    }
  }

  function stopListening() {
    if (stateRef.current.status === "listening") {
      recognition.current?.stop();
    }
  }

  function mute() {
    apply({ type: "MUTE" });
  }

  function stopSpeaking() {
    if (stateRef.current.status === "speaking") {
      pendingReply.current = null;
      speech.current?.cancel();
      speech.current = null;
      apply({ type: "STOP_SPEAKING" });
    }
  }

  // Speech starts only after "speaking" has rendered. The turn's own state
  // updates — the reply in the transcript, its UI commands in uiStore — were
  // made before REPLY and commit with it or earlier, so what is heard never
  // runs ahead of what is on screen (AC3). Speaking straight from the turn's
  // promise did: the commands were dispatched but not yet rendered.
  useEffect(() => {
    const waiting = pendingReply.current;
    if (state.status === "speaking" && waiting !== null && waiting.turnId === state.turnId) {
      pendingReply.current = null;
      speak(waiting.turnId, waiting.reply);
    }
    // Keyed on status and turn only: speak() reads refs, not render state.
  }, [state.status, state.turnId]);

  // Leaving the page stops the microphone and any speech at once.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearListenTimer();
      recognition.current?.abort();
      recognition.current = null;
      speech.current?.cancel();
      speech.current = null;
    };
  }, []);

  return { state, start, stopListening, mute, stopSpeaking };
}
