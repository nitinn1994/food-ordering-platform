import { describe, expect, it } from "vitest";
import {
  MAX_ID_LENGTH,
  MAX_CORRELATION_ID_LENGTH,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  correlationIdSchema,
  idempotencyKeySchema,
  menuCategoryIdSchema,
  menuItemIdSchema,
} from "./ids";

describe("menu identifiers (AC1)", () => {
  it("accepts the ids the menu fixture actually uses", () => {
    for (const id of ["tiramisu", "garlic-bread", "soup-of-the-day", "item-1"]) {
      expect(menuItemIdSchema.safeParse(id).success).toBe(true);
    }
    for (const id of ["starters", "mains", "desserts"]) {
      expect(menuCategoryIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("rejects an empty id", () => {
    expect(menuItemIdSchema.safeParse("").success).toBe(false);
  });

  it("rejects shapes that are not lowercase kebab-case", () => {
    for (const id of [
      "Tiramisu",
      "garlic_bread",
      "-leading",
      "trailing-",
      "double--dash",
      "has space",
      "path/traversal",
    ]) {
      expect(menuItemIdSchema.safeParse(id).success).toBe(false);
    }
  });

  it("rejects an id longer than the maximum", () => {
    expect(menuItemIdSchema.safeParse("a".repeat(MAX_ID_LENGTH)).success).toBe(
      true,
    );
    expect(
      menuItemIdSchema.safeParse("a".repeat(MAX_ID_LENGTH + 1)).success,
    ).toBe(false);
  });
});

describe("correlation id and idempotency key (AC1)", () => {
  it("accepts any non-empty opaque string within bounds", () => {
    // Format is the producer's business; only length is the contract's.
    expect(correlationIdSchema.safeParse("turn_7f3a").success).toBe(true);
    expect(idempotencyKeySchema.safeParse("01HQ8ZK9").success).toBe(true);
  });

  it("rejects empty and over-length values", () => {
    expect(correlationIdSchema.safeParse("").success).toBe(false);
    expect(
      correlationIdSchema.safeParse("a".repeat(MAX_CORRELATION_ID_LENGTH + 1))
        .success,
    ).toBe(false);
    expect(idempotencyKeySchema.safeParse("").success).toBe(false);
    expect(
      idempotencyKeySchema.safeParse("a".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1))
        .success,
    ).toBe(false);
  });
});
