import { describe, expect, it } from "vitest";
import { createOrder, isSameOrderRequest } from "./order.create";
import { CartEmptyError, OrderItemUnavailableError } from "./order.errors";
import type {
  CheckoutLine,
  CheckoutSnapshot,
  CustomerDetails,
  Order,
} from "./order.types";

const NOW = new Date("2026-09-25T12:00:00.000Z");
const ORDER_ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";

const CUSTOMER: CustomerDetails = {
  fullName: "Ada Lovelace",
  phone: "+44 20 7946 0958",
  email: "ada@example.com",
};

const TIRAMISU: CheckoutLine = {
  itemId: "tiramisu",
  name: "Tiramisu",
  unitPriceCents: 750,
  quantity: 2,
  lineSubtotalCents: 1500,
  available: true,
};

const GARLIC_BREAD: CheckoutLine = {
  itemId: "garlic-bread",
  name: "Garlic Bread",
  unitPriceCents: 450,
  quantity: 1,
  lineSubtotalCents: 450,
  available: true,
};

function checkout(overrides: Partial<CheckoutSnapshot> = {}): CheckoutSnapshot {
  return {
    ownerId: "owner-a",
    version: 4,
    lines: [TIRAMISU, GARLIC_BREAD],
    unpricedLineCount: 0,
    ...overrides,
  };
}

function place(
  snapshot: CheckoutSnapshot = checkout(),
  customer: CustomerDetails = CUSTOMER,
): Order {
  return createOrder({
    id: ORDER_ID,
    idempotencyKey: "key-1",
    checkout: snapshot,
    customer,
    now: NOW,
  });
}

describe("createOrder", () => {
  // AC1: every line is a snapshot of the priced cart, and the totals are
  // fixed from those snapshots.
  it("snapshots every priced line and fixes the totals", () => {
    expect(place()).toEqual({
      id: ORDER_ID,
      ownerId: "owner-a",
      idempotencyKey: "key-1",
      lines: [
        {
          itemId: "tiramisu",
          name: "Tiramisu",
          unitPriceCents: 750,
          quantity: 2,
          lineSubtotalCents: 1500,
        },
        {
          itemId: "garlic-bread",
          name: "Garlic Bread",
          unitPriceCents: 450,
          quantity: 1,
          lineSubtotalCents: 450,
        },
      ],
      itemCount: 3,
      subtotalCents: 1950,
      totalCents: 1950,
      status: "placed",
      customer: CUSTOMER,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("keeps the cart's line order", () => {
    const order = place(checkout({ lines: [GARLIC_BREAD, TIRAMISU] }));
    expect(order.lines.map((line) => line.itemId)).toEqual([
      "garlic-bread",
      "tiramisu",
    ]);
  });

  it("sets totalCents equal to subtotalCents (no fees)", () => {
    const order = place();
    expect(order.totalCents).toBe(order.subtotalCents);
  });

  it("accepts a zero-priced item", () => {
    const free: CheckoutLine = {
      ...TIRAMISU,
      unitPriceCents: 0,
      lineSubtotalCents: 0,
    };
    const order = place(checkout({ lines: [free] }));
    expect(order.subtotalCents).toBe(0);
    expect(order.totalCents).toBe(0);
  });

  // The snapshot is a copy: changing the input afterwards cannot change the
  // order (the domain half of AC9; the repository freezes on top).
  it("copies lines rather than referencing the snapshot's objects", () => {
    const line = { ...TIRAMISU };
    const order = place(checkout({ lines: [line] }));
    line.unitPriceCents = 1;
    (line as { name: string }).name = "Renamed";
    expect(order.lines[0]).toMatchObject({
      unitPriceCents: 750,
      name: "Tiramisu",
    });
  });

  it("copies only known customer fields and keeps an absent email absent", () => {
    const withExtra = {
      fullName: "Ada Lovelace",
      phone: "5551234",
      address: "not stored",
    } as CustomerDetails;
    const order = place(checkout(), withExtra);
    expect(order.customer).toEqual({ fullName: "Ada Lovelace", phone: "5551234" });
    expect(Object.keys(order.customer)).not.toContain("email");
  });

  // AC6
  it("rejects an empty cart", () => {
    expect(() => place(checkout({ lines: [] }))).toThrow(CartEmptyError);
  });

  // AC7
  it("rejects a cart with an unavailable line", () => {
    const unavailable = { ...GARLIC_BREAD, available: false };
    expect(() => place(checkout({ lines: [TIRAMISU, unavailable] }))).toThrow(
      OrderItemUnavailableError,
    );
  });

  // AC7: a stored line whose item left the menu is not silently dropped.
  it("rejects a cart with a line no longer on the menu", () => {
    expect(() => place(checkout({ unpricedLineCount: 1 }))).toThrow(
      OrderItemUnavailableError,
    );
  });

  it("treats a cart whose only lines left the menu as unavailable, not empty", () => {
    expect(() => place(checkout({ lines: [], unpricedLineCount: 2 }))).toThrow(
      OrderItemUnavailableError,
    );
  });

  it("maps the errors to their contract status and code", () => {
    expect(new CartEmptyError()).toMatchObject({
      status: 422,
      code: "CART_EMPTY",
    });
    expect(new OrderItemUnavailableError()).toMatchObject({
      status: 422,
      code: "MENU_ITEM_UNAVAILABLE",
    });
  });

  it("uses static messages that echo no customer detail", () => {
    for (const error of [new CartEmptyError(), new OrderItemUnavailableError()]) {
      expect(error.message).not.toContain(CUSTOMER.fullName);
      expect(error.message).not.toContain(CUSTOMER.phone);
    }
  });
});

describe("isSameOrderRequest", () => {
  const order = place();

  it("matches identical customer details", () => {
    expect(isSameOrderRequest(order, { ...CUSTOMER })).toBe(true);
  });

  it.each([
    ["fullName", { ...CUSTOMER, fullName: "Grace Hopper" }],
    ["phone", { ...CUSTOMER, phone: "5559999" }],
    ["email", { ...CUSTOMER, email: "other@example.com" }],
  ])("differs when %s differs", (_field, customer) => {
    expect(isSameOrderRequest(order, customer)).toBe(false);
  });

  it("differs when email is present on one side only", () => {
    const withoutEmail = { fullName: CUSTOMER.fullName, phone: CUSTOMER.phone };
    expect(isSameOrderRequest(order, withoutEmail)).toBe(false);
    const orderWithoutEmail = place(checkout(), withoutEmail);
    expect(isSameOrderRequest(orderWithoutEmail, CUSTOMER)).toBe(false);
    expect(isSameOrderRequest(orderWithoutEmail, withoutEmail)).toBe(true);
  });
});
