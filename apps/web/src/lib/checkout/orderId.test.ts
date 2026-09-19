import { describe, expect, it } from "vitest";
import { createOrderId } from "./orderId";

describe("createOrderId", () => {
  it("matches the ORD-XXXXXX format", () => {
    expect(createOrderId()).toMatch(/^ORD-[A-Z0-9]{6}$/);
  });

  it("is deterministic under an injected random source", () => {
    const first = createOrderId(() => 0);
    const second = createOrderId(() => 0);
    expect(first).toBe(second);
    expect(first).toBe("ORD-000000");
  });

  it("produces different output for a different random source", () => {
    const low = createOrderId(() => 0);
    const high = createOrderId(() => 0.999999);
    expect(low).not.toBe(high);
  });
});
