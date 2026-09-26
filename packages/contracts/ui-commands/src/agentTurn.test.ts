import { describe, expect, it } from "vitest";
import {
  MAX_TURN_MESSAGE_LENGTH,
  MAX_TURN_REPLY_LENGTH,
  agentTurnRequestSchema,
  agentTurnResponseSchema,
  parseAgentTurnResponse,
} from "./agentTurn";
import { MAX_COMMANDS_PER_BATCH } from "./envelope";

// docs/features/phase-15-ai-ui-commands/requirements.md AC4.

const META = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  issuedAt: "2026-09-26T12:00:00.000Z",
} as const;

const SHOW_DESSERTS = { type: "ShowMenuCategory", categoryId: "desserts" };
const OPEN_CART = { type: "OpenCartPanel", open: true };

function batch(commands: unknown[], overrides: Record<string, unknown> = {}) {
  return { ...META, commands, ...overrides };
}

describe("agentTurnRequestSchema", () => {
  it("accepts a message", () => {
    expect(agentTurnRequestSchema.safeParse({ message: "Hello" }).success).toBe(
      true,
    );
  });

  it.each([
    ["empty", { message: "" }],
    ["whitespace only", { message: "   \n\t" }],
    ["over the limit", { message: "a".repeat(MAX_TURN_MESSAGE_LENGTH + 1) }],
    ["missing", {}],
    ["with an unknown key", { message: "Hello", execute: "alert(1)" }],
  ])("rejects a message that is %s", (_label, input) => {
    expect(agentTurnRequestSchema.safeParse(input).success).toBe(false);
  });

  it("accepts a message exactly at the limit", () => {
    const input = { message: "a".repeat(MAX_TURN_MESSAGE_LENGTH) };
    expect(agentTurnRequestSchema.safeParse(input).success).toBe(true);
  });
});

describe("agentTurnResponseSchema", () => {
  it("accepts a reply with no uiCommands", () => {
    expect(agentTurnResponseSchema.safeParse({ reply: "Hi" }).success).toBe(
      true,
    );
  });

  it("rejects uiCommands: null — the field is omitted, never null (OD12)", () => {
    const input = { reply: "Hi", uiCommands: null };
    expect(agentTurnResponseSchema.safeParse(input).success).toBe(false);
  });
});

describe("parseAgentTurnResponse — accepted", () => {
  it("accepts a response with no uiCommands, reporting null", () => {
    expect(parseAgentTurnResponse({ reply: "Hi" })).toEqual({
      accepted: true,
      reply: "Hi",
      uiCommands: null,
    });
  });

  it("accepts one command", () => {
    const result = parseAgentTurnResponse({
      reply: "Here's your cart.",
      uiCommands: batch([OPEN_CART]),
    });
    expect(result).toEqual({
      accepted: true,
      reply: "Here's your cart.",
      uiCommands: {
        accepted: true,
        ...META,
        results: [{ status: "accepted", command: OPEN_CART }],
      },
    });
  });

  it("accepts the maximum number of commands, in order", () => {
    const commands = Array.from({ length: MAX_COMMANDS_PER_BATCH }, (_, i) =>
      i % 2 === 0 ? SHOW_DESSERTS : OPEN_CART,
    );
    const result = parseAgentTurnResponse({
      reply: "Done.",
      uiCommands: batch(commands),
    });
    if (!result.accepted || !result.uiCommands?.accepted) {
      throw new Error("expected an accepted batch");
    }
    expect(result.uiCommands.results.map((r) => r.status)).toEqual(
      commands.map(() => "accepted"),
    );
    expect(
      result.uiCommands.results.map((r) =>
        r.status === "accepted" ? r.command.type : null,
      ),
    ).toEqual(commands.map((c) => c.type));
  });

  it("accepts a reply exactly at the limit", () => {
    const reply = "a".repeat(MAX_TURN_REPLY_LENGTH);
    expect(parseAgentTurnResponse({ reply }).accepted).toBe(true);
  });
});

describe("parseAgentTurnResponse — the whole response is rejected", () => {
  it.each([
    ["an unknown top-level key", { reply: "Hi", execute: "someJavaScript()" }],
    ["a missing reply", { uiCommands: batch([OPEN_CART]) }],
    ["an empty reply", { reply: "" }],
    ["a reply over the limit", { reply: "a".repeat(MAX_TURN_REPLY_LENGTH + 1) }],
    ["a non-string reply", { reply: 42 }],
    ["not an object", "Here are the pizzas."],
    ["null", null],
  ])("for %s", (_label, input) => {
    const result = parseAgentTurnResponse(input);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.received).toBe(input);
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("parseAgentTurnResponse — the batch is rejected, the reply kept", () => {
  it.each([
    [
      "over the command cap",
      batch(
        Array.from({ length: MAX_COMMANDS_PER_BATCH + 1 }, () => OPEN_CART),
      ),
    ],
    ["an unsupported contractVersion", batch([OPEN_CART], { contractVersion: 2 })],
    ["a missing correlationId", { ...batch([OPEN_CART]), correlationId: undefined }],
    ["a non-UTC issuedAt", batch([OPEN_CART], { issuedAt: "2026-09-26T12:00:00+00:00" })],
    ["an empty commands array", batch([])],
    ["an unknown envelope key", batch([OPEN_CART], { execute: "alert(1)" })],
    ["null", null],
  ])("for %s", (_label, uiCommands) => {
    const result = parseAgentTurnResponse({ reply: "Hi", uiCommands });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.reply).toBe("Hi");
      expect(result.uiCommands?.accepted).toBe(false);
    }
  });
});

describe("parseAgentTurnResponse — only the offending command is rejected", () => {
  it.each([
    ["an unknown type", { type: "DeleteAllOrders", itemId: "x" }],
    ["an arbitrary execute payload", { execute: "someJavaScript(...)" }],
    [
      "an unknown key on a known command",
      { type: "OpenCartPanel", open: true, execute: "alert(1)" },
    ],
    ["a missing field", { type: "ShowMenuCategory" }],
    ["a wrong field type", { type: "OpenCartPanel", open: "true" }],
    ["a non-slug id", { type: "HighlightItem", itemId: "../admin" }],
    ["a URL as an id", { type: "ShowItemDetail", itemId: "https://evil.test" }],
  ])("for %s, keeping its siblings", (_label, bad) => {
    const result = parseAgentTurnResponse({
      reply: "Hi",
      uiCommands: batch([SHOW_DESSERTS, bad, OPEN_CART]),
    });
    if (!result.accepted || !result.uiCommands?.accepted) {
      throw new Error("expected an accepted response and envelope");
    }
    expect(result.uiCommands.results).toEqual([
      { status: "accepted", command: SHOW_DESSERTS },
      { status: "rejected", reason: expect.any(String), received: bad },
      { status: "accepted", command: OPEN_CART },
    ]);
  });
});
