import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import { createFetchStub } from "../../test/fetchStub";
import { AGENT_TURN_TIMEOUT_MS, sendAgentTurn } from "./agentService";

// docs/features/phase-15-ai-ui-commands/requirements.md AC14, AC16.

const META = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  issuedAt: "2026-09-26T12:00:00.000Z",
};
const OPEN_CART = { type: "OpenCartPanel", open: true };

function setup() {
  const stub = createFetchStub();
  return { stub, deps: { fetchImpl: stub.fetch } };
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the turn to fail");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("sendAgentTurn — the request", () => {
  it("POSTs the message to the same-origin ai-service proxy, never ai-service itself", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: { reply: "Hi" } });

    await sendAgentTurn("show me the desserts", deps);

    expect(stub.calls).toEqual([
      {
        url: "/api/ai/v1/agent/turns",
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: { message: "show me the desserts" },
      },
    ]);
  });
});

describe("sendAgentTurn — the response", () => {
  it("returns the reply and null when the turn carried no commands", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: { reply: "Hi" } });

    await expect(sendAgentTurn("Hello", deps)).resolves.toEqual({
      reply: "Hi",
      uiCommands: null,
    });
  });

  it("returns the batch as parseBatch judged it — a bad command drops alone", async () => {
    const { stub, deps } = setup();
    const bad = { type: "OpenCartPanel", open: true, execute: "alert(1)" };
    stub.reply({
      body: { reply: "Here.", uiCommands: { ...META, commands: [OPEN_CART, bad] } },
    });

    const turn = await sendAgentTurn("cart", deps);

    expect(turn.reply).toBe("Here.");
    expect(turn.uiCommands).toEqual({
      accepted: true,
      ...META,
      results: [
        { status: "accepted", command: OPEN_CART },
        { status: "rejected", reason: expect.any(String), received: bad },
      ],
    });
  });

  it("keeps the reply when the whole batch envelope is bad", async () => {
    const { stub, deps } = setup();
    stub.reply({
      body: {
        reply: "Here.",
        uiCommands: { ...META, contractVersion: 2, commands: [OPEN_CART] },
      },
    });

    const turn = await sendAgentTurn("cart", deps);

    expect(turn.reply).toBe("Here.");
    expect(turn.uiCommands?.accepted).toBe(false);
  });

  it.each([
    ["an unknown top-level key", { reply: "Hi", execute: "someJavaScript()" }],
    ["a missing reply", { uiCommands: { ...META, commands: [OPEN_CART] } }],
    ["a non-object body", "Here are the pizzas."],
  ])("rejects a response with %s as invalid", async (_label, body) => {
    const { stub, deps } = setup();
    stub.reply({ body });

    const error = await rejection(sendAgentTurn("Hello", deps));

    expect(error.kind).toBe("invalid-response");
  });
});

describe("sendAgentTurn — failures are never retried (a turn may have changed the cart)", () => {
  it.each([
    ["AGENT_FAILED", 500],
    ["SERVICE_UNAVAILABLE", 503],
  ])("%s (%i) fails after exactly one request", async (code, status) => {
    const { stub, deps } = setup();
    stub.reply({ status, body: { code, message: "Backend detail." } });

    const error = await rejection(sendAgentTurn("add tiramisu", deps));

    expect(error).toMatchObject({ kind: "http", status, code });
    expect(stub.calls).toHaveLength(1);
  });

  it("a network failure fails after exactly one request", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true });

    const error = await rejection(sendAgentTurn("add tiramisu", deps));

    expect(error.kind).toBe("network");
    expect(stub.calls).toHaveLength(1);
  });

  it("gives up after 30 s and reports a timeout", async () => {
    vi.useFakeTimers();
    const { stub, deps } = setup();
    stub.reply(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const pending = rejection(sendAgentTurn("Hello", deps));
    await vi.advanceTimersByTimeAsync(AGENT_TURN_TIMEOUT_MS);

    expect(AGENT_TURN_TIMEOUT_MS).toBe(30_000);
    expect((await pending).kind).toBe("timeout");
    expect(stub.calls).toHaveLength(1);
  });
});
