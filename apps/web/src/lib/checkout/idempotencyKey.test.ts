import { describe, expect, it } from "vitest";
import { idempotencyKeySchema } from "@contracts/common";
import { createIdempotencyKey } from "./idempotencyKey";

describe("createIdempotencyKey", () => {
  it("produces a key the contract accepts", () => {
    expect(idempotencyKeySchema.safeParse(createIdempotencyKey()).success).toBe(true);
  });

  it("produces a different key each call", () => {
    expect(createIdempotencyKey()).not.toBe(createIdempotencyKey());
  });

  it("is deterministic under an injected generator", () => {
    expect(createIdempotencyKey(() => "fixed-key")).toBe("fixed-key");
  });
});
