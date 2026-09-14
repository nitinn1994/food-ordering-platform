import { describe, expect, it } from "vitest";
import { formatCents, sumCents } from "./money";

describe("formatCents", () => {
  it("formats whole dollars", () => {
    expect(formatCents(1200)).toBe("$12.00");
  });

  it("formats cents correctly", () => {
    expect(formatCents(1250)).toBe("$12.50");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("sumCents", () => {
  it("sums an empty list to zero", () => {
    expect(sumCents([])).toBe(0);
  });

  it("sums integer cents without float drift", () => {
    // 0.1 + 0.2 in float dollars famously does not equal 0.3. Cents avoid
    // this because the values stay integers throughout.
    expect(sumCents([10, 20])).toBe(30);
    expect(formatCents(sumCents([10, 20]))).toBe("$0.30");
  });
});
