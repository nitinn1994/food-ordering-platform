import { describe, expect, it } from "vitest";
import { buildSimulatedOrder, resolveOrderLines } from "./order";
import { MENU } from "../fixtures/menu";
import type { CartLine } from "../state/cartStore";
import type { CustomerDetails } from "./types";

const CUSTOMER: CustomerDetails = {
  fullName: "  Ada Lovelace  ",
  phone: " 555-123-4567 ",
  email: "",
};

describe("resolveOrderLines", () => {
  it("carries name, unit price, quantity, and line subtotal per line", () => {
    const lines: CartLine[] = [{ itemId: "garlic-bread", quantity: 2 }];
    expect(resolveOrderLines(lines, MENU)).toEqual([
      {
        itemId: "garlic-bread",
        name: "Garlic Bread",
        unitPriceCents: 595,
        quantity: 2,
        lineSubtotalCents: 1190,
      },
    ]);
  });

  it("drops an unresolvable line rather than throwing", () => {
    const lines: CartLine[] = [{ itemId: "does-not-exist", quantity: 5 }];
    expect(resolveOrderLines(lines, MENU)).toEqual([]);
  });

  it("is what buildSimulatedOrder's lines are built from", () => {
    const lines: CartLine[] = [
      { itemId: "garlic-bread", quantity: 2 },
      { itemId: "tiramisu", quantity: 1 },
    ];
    const order = buildSimulatedOrder(lines, MENU, CUSTOMER, "ORD-ABC123", 0);
    expect(order.lines).toEqual(resolveOrderLines(lines, MENU));
  });
});

describe("buildSimulatedOrder", () => {
  it("carries name, unit price, quantity, and line subtotal per line", () => {
    const lines: CartLine[] = [{ itemId: "garlic-bread", quantity: 2 }];
    const order = buildSimulatedOrder(lines, MENU, CUSTOMER, "ORD-ABC123", 0);
    expect(order.lines).toEqual([
      {
        itemId: "garlic-bread",
        name: "Garlic Bread",
        unitPriceCents: 595,
        quantity: 2,
        lineSubtotalCents: 1190,
      },
    ]);
  });

  it("sets subtotalCents to the same value cartSubtotalCents would produce", () => {
    const lines: CartLine[] = [
      { itemId: "garlic-bread", quantity: 2 },
      { itemId: "tiramisu", quantity: 1 },
    ];
    const order = buildSimulatedOrder(lines, MENU, CUSTOMER, "ORD-ABC123", 0);
    expect(order.subtotalCents).toBe(595 * 2 + 750);
  });

  it("sets totalCents equal to subtotalCents — no tax, fee, tip, or discount", () => {
    const lines: CartLine[] = [{ itemId: "tiramisu", quantity: 1 }];
    const order = buildSimulatedOrder(lines, MENU, CUSTOMER, "ORD-ABC123", 0);
    expect(order.totalCents).toBe(order.subtotalCents);
    expect(Object.keys(order)).not.toContain("taxCents");
  });

  it("drops an unresolvable line rather than throwing", () => {
    const lines: CartLine[] = [{ itemId: "does-not-exist", quantity: 5 }];
    const order = buildSimulatedOrder(lines, MENU, CUSTOMER, "ORD-ABC123", 0);
    expect(order.lines).toEqual([]);
    expect(order.subtotalCents).toBe(0);
    expect(order.totalCents).toBe(0);
  });

  it("trims customer details in the snapshot", () => {
    const order = buildSimulatedOrder([], MENU, CUSTOMER, "ORD-ABC123", 0);
    expect(order.customer).toEqual({
      fullName: "Ada Lovelace",
      phone: "555-123-4567",
      email: "",
    });
  });

  it("carries orderId and placedAt through unchanged", () => {
    const order = buildSimulatedOrder([], MENU, CUSTOMER, "ORD-ABC123", 12345);
    expect(order.orderId).toBe("ORD-ABC123");
    expect(order.placedAt).toBe(12345);
  });

  it("is a snapshot — later mutating the source lines array does not change it", () => {
    const lines: CartLine[] = [{ itemId: "tiramisu", quantity: 1 }];
    const order = buildSimulatedOrder(lines, MENU, CUSTOMER, "ORD-ABC123", 0);
    lines.push({ itemId: "gelato", quantity: 1 });
    expect(order.lines).toHaveLength(1);
  });
});
