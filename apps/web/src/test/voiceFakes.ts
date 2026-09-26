import type {
  RecognitionHandle,
  RecognitionOptions,
  SpeechHandle,
  SpeechOptions,
  SpeechToText,
  TextToSpeech,
  VoiceErrorKind,
} from "../lib/voice/types";

// Test-only stand-ins for the voice boundary — docs/features/phase-16-voice-
// interaction/test-plan.md. jsdom has no Speech APIs, so session and
// component tests drive these instead: each start()/speak() is recorded as a
// session the test can make emit events, in any order, including after it
// was stopped or cancelled (the stale-event cases, AC10).

export type FakeRecognitionSession = {
  options: RecognitionOptions;
  stopped: boolean;
  aborted: boolean;
  interim: (text: string) => void;
  final: (text: string) => void;
  error: (kind: VoiceErrorKind) => void;
  end: () => void;
};

export class FakeSpeechToText implements SpeechToText {
  readonly sessions: FakeRecognitionSession[] = [];

  constructor(readonly isSupported = true) {}

  start(options: RecognitionOptions): RecognitionHandle {
    const session: FakeRecognitionSession = {
      options,
      stopped: false,
      aborted: false,
      interim: (text) => options.onInterim(text),
      final: (text) => options.onFinal(text),
      error: (kind) => options.onError(kind),
      end: () => options.onEnd(),
    };
    this.sessions.push(session);
    return {
      stop: () => {
        session.stopped = true;
      },
      abort: () => {
        session.aborted = true;
      },
    };
  }

  get latest(): FakeRecognitionSession {
    const session = this.sessions.at(-1);
    if (!session) {
      throw new Error("FakeSpeechToText: start() was never called");
    }
    return session;
  }
}

export type FakeUtterance = {
  text: string;
  options: SpeechOptions;
  cancelled: boolean;
  finish: () => void;
  fail: () => void;
};

export class FakeTextToSpeech implements TextToSpeech {
  readonly utterances: FakeUtterance[] = [];

  constructor(readonly isSupported = true) {}

  speak(text: string, options: SpeechOptions): SpeechHandle {
    const utterance: FakeUtterance = {
      text,
      options,
      cancelled: false,
      finish: () => options.onEnd(),
      fail: () => options.onError("playback-failed"),
    };
    this.utterances.push(utterance);
    return {
      cancel: () => {
        utterance.cancelled = true;
      },
    };
  }

  get latest(): FakeUtterance {
    const utterance = this.utterances.at(-1);
    if (!utterance) {
      throw new Error("FakeTextToSpeech: speak() was never called");
    }
    return utterance;
  }
}
