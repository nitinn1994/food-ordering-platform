import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import type { Nudge } from "@contracts/api-contracts";
import { VoiceLauncher, VoiceShell } from "./VoiceShell";
import { ChatInput } from "../chat/ChatInput";
import { NudgeToast } from "../nudges/NudgeToast";
import { AgentTurnProvider } from "../../lib/agent/AgentTurnProvider";
import { NudgeProvider } from "../../lib/nudges/NudgeProvider";
import { EMPTY_CART, pricedCart, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse, type StubReply } from "../../test/fetchStub";
import { useCart } from "../../lib/state/cartStore";
import { FakeSpeechToText, FakeTextToSpeech } from "../../test/voiceFakes";
import { VOICE_DISCLOSURE, VOICE_UNSUPPORTED_HINT } from "../../lib/voice/voiceMessages";

// docs/features/mcdelivery-redesign/requirements.md AC-V3–AC-V6.

const META = { contractVersion: 1, correlationId: "turn_v5", issuedAt: "2026-10-01T12:00:00.000Z" };
const NUDGE: Nudge = {
  id: "rule:complete-meal-side:garlic-bread",
  kind: "complete-meal",
  surface: "voice",
  itemId: "garlic-bread",
  itemName: "Garlic Bread",
  headline: "Add Garlic Bread to complete your meal",
  priceCents: 595,
};

function setup(replies: StubReply[] = [], { supported = true } = {}) {
  const stt = new FakeSpeechToText(supported);
  const tts = new FakeTextToSpeech();
  const rendered = renderWithCart(
    <NudgeProvider>
      <AgentTurnProvider>
        <VoiceShell adapters={{ stt, tts }}>
          <VoiceLauncher />
          <ChatInput />
          <NudgeToast />
        </VoiceShell>
      </AgentTurnProvider>
    </NudgeProvider>,
    { cart: EMPTY_CART, replies },
  );
  return { stt, tts, rendered };
}

function launcher() {
  // The header launcher; the floating one has the same name (CSS shows one).
  return screen.getAllByRole("button", { name: "Talk to order" })[0]!;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoiceShell — reaching voice (AC-V3)", () => {
  it("opens a sheet on first use with the disclosure, without touching the microphone", async () => {
    const { stt, rendered } = setup();
    const { user } = await rendered;

    await user.click(launcher());

    const sheet = screen.getByRole("dialog", { name: "Order by voice" });
    expect(sheet).toHaveTextContent(VOICE_DISCLOSURE);
    expect(stt.sessions).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Start talking" })).toHaveFocus();
  });

  it("sends a spoken request through the shared turn, shows it in the chat, and speaks the reply", async () => {
    const { stt, tts, rendered } = setup([
      { body: { reply: "Here's what I found.", uiCommands: { ...META, commands: [{ type: "SearchMenu", query: "burger" }] } } },
      { body: EMPTY_CART },
    ]);
    const { user, stub } = await rendered;

    await user.click(launcher());
    await user.click(screen.getByRole("button", { name: "Start talking" }));
    expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument();
    await act(async () => stt.latest.final("find burger"));

    await waitFor(() => expect(tts.utterances).toHaveLength(1));
    expect(tts.latest.text).toBe("Here's what I found.");
    expect(stub.calls[1]).toMatchObject({ url: "/api/ai/v1/agent/turns", body: { message: "find burger" } });
    // The same transcript the chat shows.
    expect(screen.getAllByText("find burger").length).toBeGreaterThanOrEqual(1);
  });

  it("listens straight away once introduced", async () => {
    const { stt, rendered } = setup();
    const { user } = await rendered;
    await user.click(launcher());
    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => stt.latest.end());
    await user.click(screen.getByRole("button", { name: "Close voice" }));

    await user.click(launcher());

    expect(stt.sessions).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument();
  });

  it("closes with Escape, stops listening, and returns focus to the launcher", async () => {
    const { stt, rendered } = setup();
    const { user } = await rendered;
    await user.click(launcher());
    await user.click(screen.getByRole("button", { name: "Start talking" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stt.latest.stopped).toBe(true);
    expect(launcher()).toHaveFocus();
  });

  it("points the chat at the header microphone instead of a second one", async () => {
    const { rendered } = setup();
    await rendered;
    expect(screen.getByText("Prefer to talk? Tap the microphone at the top.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
  });
});

describe("VoiceShell — unsupported browsers (AC-V5)", () => {
  it("shows no microphone anywhere, and tells the customer to type", async () => {
    const { rendered } = setup([], { supported: false });
    await rendered;
    expect(screen.queryByRole("button", { name: "Talk to order" })).not.toBeInTheDocument();
    expect(screen.getByText(VOICE_UNSUPPORTED_HINT)).toBeInTheDocument();
    expect(screen.getByLabelText("Chat message")).toBeEnabled();
  });
});

describe("VoiceShell — answering a spoken suggestion (AC-V4)", () => {
  async function offerSpokenNudge() {
    const context = setup([
      {
        body: {
          reply: "Added it to your cart. Add Garlic Bread to complete your meal?",
          uiCommands: { ...META, commands: [{ type: "ShowNudge", nudgeId: NUDGE.id }] },
        },
      },
      { body: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]) },
      { body: { nudges: [NUDGE] } },
    ]);
    const { user, stub } = await context.rendered;
    await user.click(launcher());
    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => context.stt.latest.final("add margherita pizza"));
    await screen.findByRole("region", { name: "Suggestion" });
    await act(async () => context.tts.latest.finish());
    return { ...context, user, stub };
  }

  it("a 'yes' adds the suggested item through the customer's own add-to-cart", async () => {
    const { stt, tts, user, stub } = await offerSpokenNudge();
    stub.reply(
      { body: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }, { itemId: "garlic-bread", quantity: 1 }]) },
      // The ordinary post-add lookup that follows any successful add.
      { body: { nudges: [] } },
    );

    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => stt.latest.final("yes"));

    await waitFor(() =>
      expect(stub.calls).toContainEqual(
        expect.objectContaining({
          method: "POST",
          url: "/api/commerce/v1/cart/items",
          body: { itemId: "garlic-bread", quantity: 1 },
        }),
      ),
    );
    expect(stub.calls.filter((call) => call.url.includes("/agent/turns"))).toHaveLength(1);
    await waitFor(() => expect(tts.latest.text).toBe("Adding Garlic Bread to your cart."));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Suggestion" })).not.toBeInTheDocument());
  });

  it("a 'no' dismisses it and sends nothing", async () => {
    const { stt, tts, user, stub } = await offerSpokenNudge();
    const before = stub.calls.length;

    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => stt.latest.final("no thanks"));

    await waitFor(() => expect(tts.latest.text).toBe("Okay, no Garlic Bread."));
    expect(stub.calls).toHaveLength(before);
    expect(screen.queryByRole("region", { name: "Suggestion" })).not.toBeInTheDocument();
  });

  it("anything else is an ordinary turn, and closes the one-utterance window", async () => {
    const { stt, tts, user, stub } = await offerSpokenNudge();
    stub.reply({ body: { reply: "Here's your cart." } }, { body: EMPTY_CART });

    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => stt.latest.final("open my cart"));
    await waitFor(() => expect(tts.latest.text).toBe("Here's your cart."));
    await act(async () => tts.latest.finish());

    stub.reply({ body: { reply: "I can show a menu category." } }, { body: EMPTY_CART });
    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => stt.latest.final("yes"));

    // "yes" now goes to the assistant, not to the old suggestion.
    await waitFor(() =>
      expect(stub.calls.filter((call) => call.url.includes("/agent/turns"))).toHaveLength(3),
    );
    expect(stub.calls.some((call) => call.method === "POST" && call.url.endsWith("/cart/items"))).toBe(false);
  });
});

describe("VoiceShell — the spoken offer never outlives what is on screen (review #2, #3)", () => {
  const OFFER_REPLIES: StubReply[] = [
    {
      body: {
        reply: "Added it to your cart. Add Garlic Bread to complete your meal?",
        uiCommands: { ...META, commands: [{ type: "ShowNudge", nudgeId: NUDGE.id }] },
      },
    },
    { body: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]) },
    { body: { nudges: [NUDGE] } },
  ];

  function ToggleToast() {
    const [shown, setShown] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setShown(false)}>
          leave page
        </button>
        {shown && <NudgeToast />}
      </>
    );
  }

  function AddSoup() {
    const { addItem } = useCart();
    return (
      <button type="button" onClick={() => addItem("soup-of-the-day")}>
        add soup
      </button>
    );
  }

  async function offer(extra?: React.ReactNode, toast: React.ReactNode = <NudgeToast />) {
    const stt = new FakeSpeechToText();
    const tts = new FakeTextToSpeech();
    const { user, stub } = await renderWithCart(
      <NudgeProvider>
        <AgentTurnProvider>
          <VoiceShell adapters={{ stt, tts }}>
            <VoiceLauncher />
            <ChatInput />
            {extra}
            {toast}
          </VoiceShell>
        </AgentTurnProvider>
      </NudgeProvider>,
      { cart: EMPTY_CART, replies: [...OFFER_REPLIES] },
    );
    await user.click(launcher());
    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => stt.latest.final("add margherita pizza"));
    await screen.findByRole("region", { name: "Suggestion" });
    await act(async () => tts.latest.finish());
    return { stt, tts, user, stub };
  }

  async function sayYes(stt: FakeSpeechToText, user: Awaited<ReturnType<typeof offer>>["user"]) {
    await user.click(screen.getByRole("button", { name: "Start talking" }));
    await act(async () => stt.latest.final("yes"));
  }

  function addedGarlic(calls: { method: string; url: string; body: unknown }[]) {
    return calls.some(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/cart/items") &&
        (call.body as { itemId?: string }).itemId === "garlic-bread",
    );
  }

  it("a typed turn ends the window: a later 'yes' goes to the assistant", async () => {
    const { stt, user, stub } = await offer();
    stub.reply({ body: { reply: "Here's your cart." } }, { body: EMPTY_CART });
    await user.type(screen.getByLabelText("Chat message"), "open my cart");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Here's your cart.");

    stub.reply({ body: { reply: "I can show a menu category." } }, { body: EMPTY_CART });
    await sayYes(stt, user);

    await waitFor(() =>
      expect(stub.calls.filter((call) => call.url.includes("/agent/turns"))).toHaveLength(3),
    );
    expect(addedGarlic(stub.calls)).toBe(false);
  });

  it("leaving the page ends the window", async () => {
    const { stt, user, stub } = await offer(undefined, <ToggleToast />);
    await user.click(screen.getByRole("button", { name: "leave page" }));

    stub.reply({ body: { reply: "I can show a menu category." } }, { body: EMPTY_CART });
    await sayYes(stt, user);

    await waitFor(() =>
      expect(stub.calls.filter((call) => call.url.includes("/agent/turns"))).toHaveLength(2),
    );
    expect(addedGarlic(stub.calls)).toBe(false);
  });

  it("a newer suggestion on screen replaces the spoken one: 'yes' never adds the old item", async () => {
    const { stt, user, stub } = await offer(<AddSoup />);
    stub.reply(
      { body: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }, { itemId: "soup-of-the-day", quantity: 1 }]) },
      { body: { nudges: [{ ...NUDGE, id: "rule:complete-meal-drink:tiramisu", itemId: "tiramisu", itemName: "Tiramisu", headline: "Finish with Tiramisu?", surface: "post-add" }] } },
    );
    await user.click(screen.getByRole("button", { name: "add soup" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Suggestion" })).toHaveTextContent("Finish with Tiramisu?"),
    );

    stub.reply({ body: { reply: "I can show a menu category." } }, { body: EMPTY_CART });
    await sayYes(stt, user);

    await waitFor(() =>
      expect(stub.calls.filter((call) => call.url.includes("/agent/turns"))).toHaveLength(2),
    );
    expect(addedGarlic(stub.calls)).toBe(false);
  });

  it("a 'yes' while the cart is still updating does nothing and says so; the offer stands", async () => {
    const { stt, tts, user, stub } = await offer(<AddSoup />);
    const slowAdd = deferred<Response>();
    stub.reply(() => slowAdd.promise);
    await user.click(screen.getByRole("button", { name: "add soup" }));

    await sayYes(stt, user);
    await waitFor(() =>
      expect(tts.latest.text).toBe("One moment — your cart is still updating. Try again in a second."),
    );
    expect(addedGarlic(stub.calls)).toBe(false);
    expect(screen.getByRole("region", { name: "Suggestion" })).toHaveTextContent("Garlic Bread");

    await act(async () =>
      slowAdd.resolve(
        jsonResponse(pricedCart([{ itemId: "margherita-pizza", quantity: 1 }, { itemId: "soup-of-the-day", quantity: 1 }])),
      ),
    );
    await act(async () => tts.latest.finish());
    stub.reply({ body: { nudges: [] } }, { body: pricedCart([{ itemId: "garlic-bread", quantity: 1 }]) }, { body: { nudges: [] } });
    await sayYes(stt, user);

    await waitFor(() => expect(addedGarlic(stub.calls)).toBe(true));
  });
});

