import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { useAgentTurn, type AgentTurn } from "./useAgentTurn";
import { EMPTY_CART, cartReply, errorReply, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse } from "../../test/fetchStub";

// docs/features/phase-16-voice-interaction/requirements.md AC1, AC4: the one
// turn path text and voice share. ChatInput.test.tsx covers the same path
// through the text form; these pin the hook's own contract — what submit
// returns, and that it refuses a second turn while one is in flight.

const TURN_URL = "/api/ai/v1/agent/turns";

let turn: AgentTurn;

function Harness() {
  turn = useAgentTurn();
  return (
    <ul>
      {turn.transcript.map((message, index) => (
        <li key={index}>{`${message.role}:${message.text}`}</li>
      ))}
      <li>{turn.pending ? "pending" : "idle"}</li>
    </ul>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAgentTurn — submit", () => {
  it("sends the trimmed text and resolves with the reply once it is shown", async () => {
    const { stub } = await renderWithCart(<Harness />, {
      replies: [{ body: { reply: "Here are the desserts." } }, cartReply(EMPTY_CART)],
    });

    let outcome: Awaited<ReturnType<AgentTurn["submit"]>> = null;
    await act(async () => {
      outcome = await turn.submit("  show me the desserts  ");
    });

    expect(outcome).toEqual({ reply: "Here are the desserts.", failed: false });
    const turnCalls = stub.calls.filter((call) => call.url === TURN_URL);
    expect(turnCalls).toHaveLength(1);
    expect(turnCalls[0]?.body).toEqual({ message: "show me the desserts" });
    expect(screen.getByText("user:show me the desserts")).toBeInTheDocument();
    expect(screen.getByText("assistant:Here are the desserts.")).toBeInTheDocument();
  });

  it("resolves with failed: true and the fixed copy when the turn fails", async () => {
    await renderWithCart(<Harness />, {
      replies: [errorReply(500, "AGENT_FAILED"), cartReply(EMPTY_CART)],
    });

    let outcome: Awaited<ReturnType<AgentTurn["submit"]>> = null;
    await act(async () => {
      outcome = await turn.submit("Hello");
    });

    expect(outcome).toEqual({
      reply: "Something went wrong on our side. Please try again.",
      failed: true,
    });
  });

  it("returns null and sends nothing for empty or whitespace-only text", async () => {
    const { stub } = await renderWithCart(<Harness />);

    act(() => {
      expect(turn.submit("")).toBeNull();
      expect(turn.submit("   ")).toBeNull();
    });

    expect(stub.calls.filter((call) => call.url === TURN_URL)).toHaveLength(0);
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("returns null for a second submit while a turn is in flight, from any caller", async () => {
    const held = deferred<Response>();
    const { stub } = await renderWithCart(<Harness />, {
      replies: [() => held.promise, cartReply(EMPTY_CART)],
    });

    let first: ReturnType<AgentTurn["submit"]> = null;
    act(() => {
      first = turn.submit("Hello");
      // Same frame: `pending` has not re-rendered yet; the ref still refuses.
      expect(turn.submit("Hello again")).toBeNull();
    });
    expect(first).not.toBeNull();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(turn.submit("And again")).toBeNull();

    await act(async () => {
      held.resolve(jsonResponse({ reply: "Hi" }));
      await first;
    });

    expect(stub.calls.filter((call) => call.url === TURN_URL)).toHaveLength(1);
    expect(screen.getByText("idle")).toBeInTheDocument();
  });
});
