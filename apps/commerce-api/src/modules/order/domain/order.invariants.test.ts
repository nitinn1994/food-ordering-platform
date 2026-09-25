import { describe, expect, it } from "vitest";
import {
  assertOrderInvariants,
  OrderInvariantViolationError,
} from "./order.invariants";
import type { Order, OrderLine } from "./order.types";

const T0 = new Date("2026-09-25T12:00:00.000Z");

const TIRAMISU: OrderLine = {
  itemId: "tiramisu",
  name: "Tiramisu",
  unitPriceCents: 750,
  quantity: 2,
  lineSubtotalCents: 1500,
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c",
    ownerId: "owner-a",
    idempotencyKey: "key-1",
    lines: [TIRAMISU],
    itemCount: 2,
    subtotalCents: 1500,
    totalCents: 1500,
    status: "placed",
    customer: { fullName: "Ada Lovelace", phone: "5551234" },
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

describe("assertOrderInvariants", () => {
  it("accepts a consistent order", () => {
    expect(() => assertOrderInvariants(order())).not.toThrow();
  });

  it("accepts quantities at both bounds", () => {
    const lines: OrderLine[] = [
      { ...TIRAMISU, quantity: 1, lineSubtotalCents: 750 },
      {
        itemId: "garlic-bread",
        name: "Garlic Bread",
        unitPriceCents: 450,
        quantity: 99,
        lineSubtotalCents: 44550,
      },
    ];
    expect(() =>
      assertOrderInvariants(
        order({
          lines,
          itemCount: 100,
          subtotalCents: 45300,
          totalCents: 45300,
        }),
      ),
    ).not.toThrow();
  });

  it("rejects an order with no lines", () => {
    expect(() =>
      assertOrderInvariants(
        order({ lines: [], itemCount: 0, subtotalCents: 0, totalCents: 0 }),
      ),
    ).toThrow(/at least one line/);
  });

  it("rejects two lines for the same item", () => {
    expect(() =>
      assertOrderInvariants(
        order({
          lines: [TIRAMISU, TIRAMISU],
          itemCount: 4,
          subtotalCents: 3000,
          totalCents: 3000,
        }),
      ),
    ).toThrow(/duplicate line for item "tiramisu"/);
  });

  it.each([0, -1, 100, 1.5])("rejects quantity %s", (quantity) => {
    const line = {
      ...TIRAMISU,
      quantity,
      lineSubtotalCents: 750 * quantity,
    };
    expect(() =>
      assertOrderInvariants(
        order({
          lines: [line],
          itemCount: quantity,
          subtotalCents: line.lineSubtotalCents,
          totalCents: line.lineSubtotalCents,
        }),
      ),
    ).toThrow(OrderInvariantViolationError);
  });

  it.each([-1, 7.5])("rejects a non-cents unit price %s", (unitPriceCents) => {
    const line = { ...TIRAMISU, unitPriceCents, lineSubtotalCents: unitPriceCents * 2 };
    expect(() =>
      assertOrderInvariants(
        order({
          lines: [line],
          subtotalCents: line.lineSubtotalCents,
          totalCents: line.lineSubtotalCents,
        }),
      ),
    ).toThrow(/non-cents amount/);
  });

  it("rejects a line subtotal that is not unit × quantity", () => {
    expect(() =>
      assertOrderInvariants(
        order({
          lines: [{ ...TIRAMISU, lineSubtotalCents: 1499 }],
          subtotalCents: 1499,
          totalCents: 1499,
        }),
      ),
    ).toThrow(/unit price × quantity/);
  });

  it("rejects an itemCount that is not the sum of quantities", () => {
    expect(() => assertOrderInvariants(order({ itemCount: 3 }))).toThrow(
      /itemCount/,
    );
  });

  it("rejects a subtotal that is not the sum of line subtotals", () => {
    expect(() =>
      assertOrderInvariants(order({ subtotalCents: 1400, totalCents: 1400 })),
    ).toThrow(/subtotalCents/);
  });

  it("rejects a total that differs from the subtotal", () => {
    expect(() => assertOrderInvariants(order({ totalCents: 1600 }))).toThrow(
      /totalCents/,
    );
  });

  it("is a plain Error, not a client-facing DomainError", () => {
    const error = new OrderInvariantViolationError("x");
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty("status");
    expect(error).not.toHaveProperty("code");
  });
});
