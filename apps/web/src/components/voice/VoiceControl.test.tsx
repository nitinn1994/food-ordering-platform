import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { ChatInput } from "../chat/ChatInput";
import type { VoiceAdapters } from "./VoiceControl";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import type { SpeechHandle, SpeechOptions } from "../../lib/voice/types";
import { EMPTY_CART, cartReply, errorReply, pricedCart, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse, type RecordedCall, type StubReply } from "../../test/fetchStub";
import { FakeSpeechToText, FakeTextToSpeech } from "../../test/voiceFakes";

// docs/features/phase-16-voice-interaction/requirements.md AC2–AC4,
// AC14–AC18: the voice control inside the real ChatInput, over the real
// shared turn, the real dispatcher and stores, with a stubbed fetch — only
// the browser's speech engines are fakes.

const TURN_URL = "/api/ai/v1/agent/turns";
const CART_URL = "/api/commerce/v1/cart";
const META = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  issuedAt: "2026-09-26T12:00:00.000Z",
};
const DESSERTS_TURN: StubReply = {
  body: {
    reply: "Here are the desserts.",
    uiCommands: { ...META, commands: [{ type: "ShowMenuCategory", categoryId: "desserts" }] },
  },
};

// Shows exactly the state a turn may change, so a test can assert on it.
function Probe() {
  const ui = useUi();
  const cart = useCart();
  return (
    <div>
      <p data-testid="category">{ui.selectedCategory ?? "none"}</p>
      <p data-testid="count">{cart.itemCount}</p>
    </div>
  );
}

// Records what was on screen at the moment the reply started being spoken
// (AC3: speech comes after the reply is shown and its commands applied).
class ObservingTextToSpeech extends FakeTextToSpeech {
  readonly seen: { category: string; transcript: string }[] = [];

  override speak(text: string, options: SpeechOptions): SpeechHandle {
    this.seen.push({
      category: screen.getByTestId("category").textContent ?? "",
      transcript: document.body.textContent ?? "",
    });
    return super.speak(text, options);
  }
}

function fakes(overrides: Partial<{ stt: FakeSpeechToText; tts: FakeTextToSpeech }> = {}) {
  return { stt: overrides.stt ?? new FakeSpeechToText(), tts: overrides.tts ?? new FakeTextToSpeech() };
}

// `null`: inject nothing, so VoiceControl detects the browser's own APIs.
async function renderChat(replies: StubReply[], voice: VoiceAdapters | null = fakes()) {
  const result = await renderWithCart(
    <>
      <ChatInput voice={voice ?? undefined} />
      <Probe />
    </>,
    { replies },
  );
  return result;
}

function mic() {
  return screen.getByRole("button", { name: /Start voice input|Stop listening/ });
}

function turnCalls(calls: RecordedCall[]) {
  return calls.filter((call) => call.url === TURN_URL);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoiceControl — the same turn as typed text (AC2, AC3)", () => {
  it("sends exactly the request the same text typed would send", async () => {
    const typed = await renderChat([DESSERTS_TURN, cartReply(EMPTY_CART)]);
    await typed.user.type(screen.getByLabelText("Chat message"), "show me the desserts");
    await typed.user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Here are the desserts.");
    const [typedCall] = turnCalls(typed.stub.calls);
    cleanup();

    const voice = fakes();
    const spoken = await renderChat([DESSERTS_TURN, cartReply(EMPTY_CART)], voice);
    await spoken.user.click(mic());
    act(() => voice.stt.latest.final(" show me the desserts "));
    await screen.findByText("Here are the desserts.");
    const [spokenCall] = turnCalls(spoken.stub.calls);

    expect(typedCall).toBeDefined();
    expect(spokenCall).toEqual(typedCall);
    expect(spokenCall?.body).toEqual({ message: "show me the desserts" });
  });

  it("re-reads the cart, shows the reply and applies its commands, and only then speaks", async () => {
    const tts = new ObservingTextToSpeech();
    const voice = fakes({ tts });
    const { stub, user } = await renderChat(
      [DESSERTS_TURN, cartReply(pricedCart([{ itemId: "tiramisu", quantity: 1 }]))],
      voice,
    );

    await user.click(mic());
    act(() => voice.stt.latest.final("show me the desserts"));

    await waitFor(() => expect(tts.utterances).toHaveLength(1));
    expect(stub.calls.map((call) => call.url)).toEqual([CART_URL, TURN_URL, CART_URL]);
    expect(tts.latest.text).toBe("Here are the desserts.");
    expect(tts.seen).toEqual([
      expect.objectContaining({ category: "desserts", transcript: expect.stringContaining("Here are the desserts.") }),
    ]);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("shows the utterance in the shared transcript as the customer's line (AC18)", async () => {
    const voice = fakes();
    const { user } = await renderChat([DESSERTS_TURN, cartReply(EMPTY_CART)], voice);

    await user.click(mic());
    act(() => voice.stt.latest.final("show me the desserts"));

    const line = await screen.findByText("show me the desserts", { exact: false, selector: "li" });
    expect(line).toHaveTextContent("You: show me the desserts");
  });

  it("shows failure copy, does not speak it, and still re-reads the cart", async () => {
    const voice = fakes();
    const { stub, user } = await renderChat([errorReply(500, "AGENT_FAILED"), cartReply(EMPTY_CART)], voice);

    await user.click(mic());
    act(() => voice.stt.latest.final("hello"));

    expect(await screen.findByText("Something went wrong on our side. Please try again.")).toBeInTheDocument();
    expect(stub.calls.map((call) => call.url)).toEqual([CART_URL, TURN_URL, CART_URL]);
    expect(voice.tts.utterances).toHaveLength(0);
    expect(mic()).toBeEnabled();
  });
});

describe("VoiceControl — one turn at a time across both channels (AC4)", () => {
  it("disables the microphone while a typed turn is in flight", async () => {
    const held = deferred<Response>();
    const { user } = await renderChat([() => held.promise, cartReply(EMPTY_CART)]);

    await user.type(screen.getByLabelText("Chat message"), "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(mic()).toBeDisabled();

    await act(async () => {
      held.resolve(jsonResponse({ reply: "Hi" }));
      await held.promise;
    });
    expect(await screen.findByRole("button", { name: "Send" })).toBeEnabled();
    expect(mic()).toBeEnabled();
  });

  it("says so, instead of dropping it, when a typed turn is sent while the microphone is listening", async () => {
    const held = deferred<Response>();
    const voice = fakes();
    const { stub, user } = await renderChat([() => held.promise, cartReply(EMPTY_CART)], voice);

    await user.click(mic());
    await user.type(screen.getByLabelText("Chat message"), "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();

    act(() => voice.stt.latest.final("add tiramisu"));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Still working on your last message — try again in a moment.",
    );
    expect(turnCalls(stub.calls)).toHaveLength(1);
    expect(turnCalls(stub.calls)[0]?.body).toEqual({ message: "Hello" });

    await act(async () => {
      held.resolve(jsonResponse({ reply: "Hi" }));
      await held.promise;
    });
    expect(await screen.findByText("Hi")).toBeInTheDocument();
    expect(voice.tts.utterances).toHaveLength(0);
    expect(mic()).toBeEnabled();
  });

  it("disables Send and the text box while a voice turn is in flight, and sends one request", async () => {
    const held = deferred<Response>();
    const voice = fakes();
    const { stub, user } = await renderChat([() => held.promise, cartReply(EMPTY_CART)], voice);

    await user.click(mic());
    act(() => voice.stt.latest.final("hello"));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.getByLabelText("Chat message")).toBeDisabled();
    expect(mic()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Processing…");
    expect(turnCalls(stub.calls)).toHaveLength(1);

    await act(async () => {
      held.resolve(jsonResponse({ reply: "Hi" }));
      await held.promise;
    });
    await waitFor(() => expect(voice.tts.utterances).toHaveLength(1));
  });
});

describe("VoiceControl — controls and announcements (AC11, AC12, AC14, AC15)", () => {
  it("is a native button, operable from the keyboard, whose name follows listening", async () => {
    const voice = fakes();
    const { user } = await renderChat([], voice);

    const button = screen.getByRole("button", { name: "Start voice input" });
    expect(button.tagName).toBe("BUTTON");
    // Its name carries the state, so it is not also a toggle (review
    // finding 5b): announcing "Stop listening, pressed" says it twice.
    expect(button).not.toHaveAttribute("aria-pressed");

    button.focus();
    await user.keyboard("{Enter}");
    const listening = screen.getByRole("button", { name: "Stop listening" });
    expect(listening).not.toHaveAttribute("aria-pressed");
    expect(voice.stt.sessions).toHaveLength(1);

    await user.keyboard("{Enter}");
    expect(voice.stt.latest.stopped).toBe(true);
    act(() => voice.stt.latest.end());

    screen.getByRole("button", { name: "Start voice input" }).focus();
    await user.keyboard(" ");
    expect(voice.stt.sessions).toHaveLength(2);
  });

  it("announces listening, shows the recording label, and announces errors with fixed copy", async () => {
    const voice = fakes();
    const { user } = await renderChat([], voice);

    expect(screen.getByRole("status")).toHaveTextContent("");
    await user.click(mic());
    expect(screen.getByRole("status")).toHaveTextContent("Listening…");
    expect(screen.getByText("● Recording")).toBeInTheDocument();

    act(() => voice.stt.latest.error("permission-denied"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Microphone access is blocked. Allow it in your browser settings, or type instead.",
    );
    expect(screen.queryByText("● Recording")).toBeNull();
    expect(screen.getByLabelText("Chat message")).toBeEnabled();
  });

  it("announces speaking and offers Stop speaking, which cancels the reply", async () => {
    const voice = fakes();
    const { user } = await renderChat([DESSERTS_TURN, cartReply(EMPTY_CART)], voice);

    await user.click(mic());
    act(() => voice.stt.latest.final("show me the desserts"));
    const stop = await screen.findByRole("button", { name: "Stop speaking" });
    expect(screen.getByRole("status")).toHaveTextContent("Speaking…");

    await user.click(stop);
    expect(voice.tts.latest.cancelled).toBe(true);
    expect(screen.queryByRole("button", { name: "Stop speaking" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("pressing the microphone while speaking stops the reply and listens (barge-in)", async () => {
    const voice = fakes();
    const { user } = await renderChat([DESSERTS_TURN, cartReply(EMPTY_CART)], voice);

    await user.click(mic());
    act(() => voice.stt.latest.final("show me the desserts"));
    await screen.findByRole("button", { name: "Stop speaking" });

    await user.click(mic());
    expect(voice.tts.latest.cancelled).toBe(true);
    expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument();
  });

  it("Stop while processing lets the turn finish — reply shown, commands applied — without speaking it", async () => {
    const held = deferred<Response>();
    const voice = fakes();
    const { user } = await renderChat([() => held.promise, cartReply(EMPTY_CART)], voice);

    await user.click(mic());
    act(() => voice.stt.latest.final("show me the desserts"));
    await user.click(await screen.findByRole("button", { name: "Don't read reply aloud" }));

    await act(async () => {
      held.resolve(jsonResponse((DESSERTS_TURN as { body: unknown }).body));
      await held.promise;
    });
    expect(await screen.findByText("Here are the desserts.")).toBeInTheDocument();
    expect(screen.getByTestId("category")).toHaveTextContent("desserts");
    expect(voice.tts.utterances).toHaveLength(0);
  });
});

describe("VoiceControl — permission, disclosure, unsupported (AC16, AC17)", () => {
  it("never starts the microphone on render, and shows the disclosure before the first press", async () => {
    const voice = fakes();
    await renderChat([], voice);

    expect(voice.stt.sessions).toHaveLength(0);
    expect(
      screen.getByText(
        "Voice input and spoken replies use your browser's speech services, which may send your audio and the replies' text to their provider.",
      ),
    ).toBeInTheDocument();
  });

  it("renders no microphone where recognition is unsupported, says so, and text still works", async () => {
    const { user } = await renderChat([{ body: { reply: "Hi" } }, cartReply(EMPTY_CART)], {
      stt: new FakeSpeechToText(false),
      tts: new FakeTextToSpeech(),
    });

    expect(screen.queryByRole("button", { name: /voice input/ })).toBeNull();
    expect(screen.getByText("Voice input isn't available in this browser — type instead.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Chat message"), "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hi")).toBeInTheDocument();
  });

  it("detects the browser's own APIs when none are injected — none in jsdom, so the hint shows", async () => {
    await renderChat([], null);

    expect(await screen.findByText("Voice input isn't available in this browser — type instead.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /voice input/ })).toBeNull();
  });
});

describe("VoiceControl — text only (AC18)", () => {
  it("renders the interim transcript as text, never as markup, and hides it when listening ends", async () => {
    const voice = fakes();
    const { user, container } = await renderChat([], voice);

    await user.click(mic());
    act(() => voice.stt.latest.interim("<b>bold</b>"));

    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(within(screen.getByRole("status")).queryByText("<b>bold</b>")).toBeNull();

    act(() => voice.stt.latest.end());
    expect(screen.queryByText("<b>bold</b>")).toBeNull();
  });
});
