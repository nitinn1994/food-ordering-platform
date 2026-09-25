import { describe, expect, it } from "vitest";
import { MAX_COMMANDS_PER_BATCH, uiCommandBatchSchema } from "./envelope";
import { parseBatch } from "./parse";

const VALID_ENVELOPE_META = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  issuedAt: "2026-09-19T10:04:11.000Z",
} as const;

describe("uiCommandBatchSchema (AC6, AC9)", () => {
  it("accepts a well-formed batch", () => {
    const result = uiCommandBatchSchema.safeParse({
      ...VALID_ENVELOPE_META,
      commands: [{ type: "ShowMenuCategory", categoryId: "desserts" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognised contractVersion", () => {
    const result = uiCommandBatchSchema.safeParse({
      ...VALID_ENVELOPE_META,
      contractVersion: 2,
      commands: [{ type: "ShowMenuCategory", categoryId: "desserts" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty commands array", () => {
    const result = uiCommandBatchSchema.safeParse({
      ...VALID_ENVELOPE_META,
      commands: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a batch over the size cap", () => {
    const oversized = Array.from({ length: MAX_COMMANDS_PER_BATCH + 1 }, () => ({
      type: "OpenCartPanel" as const,
      open: true,
    }));
    const result = uiCommandBatchSchema.safeParse({
      ...VALID_ENVELOPE_META,
      commands: oversized,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a batch at exactly the size cap", () => {
    const atCap = Array.from({ length: MAX_COMMANDS_PER_BATCH }, () => ({
      type: "OpenCartPanel" as const,
      open: true,
    }));
    const result = uiCommandBatchSchema.safeParse({
      ...VALID_ENVELOPE_META,
      commands: atCap,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown key on the envelope", () => {
    const result = uiCommandBatchSchema.safeParse({
      ...VALID_ENVELOPE_META,
      commands: [{ type: "OpenCartPanel", open: true }],
      replyTo: "https://evil.example/callback",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseBatch (AC5, AC6)", () => {
  it("accepts every command in a fully valid batch", () => {
    const result = parseBatch({
      ...VALID_ENVELOPE_META,
      commands: [
        { type: "ShowMenuCategory", categoryId: "desserts" },
        { type: "HighlightItem", itemId: "tiramisu" },
      ],
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.results).toEqual([
      {
        status: "accepted",
        command: { type: "ShowMenuCategory", categoryId: "desserts" },
      },
      {
        status: "accepted",
        command: { type: "HighlightItem", itemId: "tiramisu" },
      },
    ]);
  });

  it("drops exactly the invalid command, keeping the valid one (AC5)", () => {
    // The property this phase exists to prove: a single malformed command
    // must not discard its valid sibling.
    const result = parseBatch({
      ...VALID_ENVELOPE_META,
      commands: [
        { type: "SearchMenu", query: "pasta" },
        { type: "ShowMenuCategory" }, // missing categoryId
      ],
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      status: "accepted",
      command: { type: "SearchMenu", query: "pasta" },
    });
    expect(result.results[1]?.status).toBe("rejected");
  });

  it("drops a business intent masquerading as a UI command inside a batch", () => {
    // The exact §4.4 failure the boundary exists to catch, now inside a
    // batch rather than a lone command.
    const result = parseBatch({
      ...VALID_ENVELOPE_META,
      commands: [
        { type: "HighlightItem", itemId: "tiramisu" },
        { type: "AddToCart", itemId: "tiramisu", quantity: 1 },
      ],
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.results[0]?.status).toBe("accepted");
    expect(result.results[1]?.status).toBe("rejected");
  });

  it("rejects the whole batch when the envelope itself is malformed", () => {
    // No correlationId, no version — there is no partial turn to salvage.
    const result = parseBatch({
      commands: [{ type: "OpenCartPanel", open: true }],
    });
    expect(result.accepted).toBe(false);
  });

  it("rejects an unrecognised contractVersion for the whole batch", () => {
    const result = parseBatch({
      ...VALID_ENVELOPE_META,
      contractVersion: 2,
      commands: [{ type: "OpenCartPanel", open: true }],
    });
    expect(result.accepted).toBe(false);
  });

  it("never throws on arbitrary input", () => {
    for (const input of [null, undefined, 42, "string", [], {}]) {
      expect(() => parseBatch(input)).not.toThrow();
    }
  });
});
