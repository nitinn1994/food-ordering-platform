import { describe, expect, it } from "vitest";
import {
  createOrderRequestSchema,
  customerDetailsSchema,
  orderIdSchema,
  orderLineSchema,
  orderParamsSchema,
  orderResponseSchema,
  orderStatusSchema,
} from "./order";

const VALID_CUSTOMER = {
  fullName: "Ada Lovelace",
  phone: "+44 (20) 7946-0958",
  email: "ada@example.com",
};

const VALID_REQUEST = {
  idempotencyKey: "checkout-attempt-1",
  customer: VALID_CUSTOMER,
};

const VALID_LINE = {
  itemId: "tiramisu",
  name: "Tiramisu",
  unitPriceCents: 750,
  quantity: 2,
  lineSubtotalCents: 1500,
};

const VALID_ORDER_ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";

const VALID_ORDER = {
  orderId: VALID_ORDER_ID,
  status: "placed",
  placedAt: "2026-09-25T12:00:00.000Z",
  customer: VALID_CUSTOMER,
  items: [VALID_LINE],
  itemCount: 2,
  subtotalCents: 1500,
  totalCents: 1500,
};

describe("createOrderRequestSchema", () => {
  it("accepts a well-formed request", () => {
    expect(createOrderRequestSchema.safeParse(VALID_REQUEST).success).toBe(
      true,
    );
  });

  // AC10: items, prices, totals, status and identity are the server's —
  // rejected by strictness, never silently stripped.
  it.each([
    ["items", [VALID_LINE]],
    ["unitPriceCents", 1],
    ["subtotalCents", 1],
    ["totalCents", 1],
    ["status", "placed"],
    ["cartId", "someone-else"],
    ["ownerId", "someone-else"],
    ["orderId", VALID_ORDER_ID],
  ])("rejects a caller-supplied %s", (key, value) => {
    const result = createOrderRequestSchema.safeParse({
      ...VALID_REQUEST,
      [key]: value,
    });
    expect(result.success).toBe(false);
  });

  it.each(["idempotencyKey", "customer"])("rejects a missing %s", (key) => {
    const request: Record<string, unknown> = { ...VALID_REQUEST };
    delete request[key];
    expect(createOrderRequestSchema.safeParse(request).success).toBe(false);
  });

  it("rejects an empty or oversized idempotencyKey", () => {
    for (const idempotencyKey of ["", "k".repeat(129)]) {
      const result = createOrderRequestSchema.safeParse({
        ...VALID_REQUEST,
        idempotencyKey,
      });
      expect(result.success).toBe(false);
    }
  });

  it("accepts an idempotencyKey at its 128-character bound", () => {
    const result = createOrderRequestSchema.safeParse({
      ...VALID_REQUEST,
      idempotencyKey: "k".repeat(128),
    });
    expect(result.success).toBe(true);
  });
});

describe("customerDetailsSchema", () => {
  it("accepts a customer without an email", () => {
    const withoutEmail = {
      fullName: VALID_CUSTOMER.fullName,
      phone: VALID_CUSTOMER.phone,
    };
    expect(customerDetailsSchema.safeParse(withoutEmail).success).toBe(true);
  });

  // OD6: a blank email is absent, never "".
  it("rejects an empty-string email", () => {
    const result = customerDetailsSchema.safeParse({
      ...VALID_CUSTOMER,
      email: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key", () => {
    const result = customerDetailsSchema.safeParse({
      ...VALID_CUSTOMER,
      address: "1 Main St",
    });
    expect(result.success).toBe(false);
  });

  it.each(["A", "Ada Lovelace", "José María O'Neil-Smith", "a".repeat(100)])(
    "accepts fullName %j",
    (fullName) => {
      const result = customerDetailsSchema.safeParse({
        ...VALID_CUSTOMER,
        fullName,
      });
      expect(result.success).toBe(true);
    },
  );

  it.each(["", " ", " Ada", "Ada ", "a".repeat(101), "Ada\nLovelace"])(
    "rejects fullName %j",
    (fullName) => {
      const result = customerDetailsSchema.safeParse({
        ...VALID_CUSTOMER,
        fullName,
      });
      expect(result.success).toBe(false);
    },
  );

  it.each([
    "5551234",
    "+15551234567",
    "(555) 123-4567",
    "+44 20 7946 0958",
    "1".repeat(20),
  ])("accepts phone %j", (phone) => {
    const result = customerDetailsSchema.safeParse({ ...VALID_CUSTOMER, phone });
    expect(result.success).toBe(true);
  });

  it.each([
    "",
    "555123",
    "1".repeat(21),
    " 5551234",
    "5551234 ",
    "555-CALL-NOW",
    "++5551234",
    "555.123.4567",
    `${"1".repeat(10)}${" ".repeat(20)}${"1".repeat(3)}`,
  ])("rejects phone %j", (phone) => {
    const result = customerDetailsSchema.safeParse({ ...VALID_CUSTOMER, phone });
    expect(result.success).toBe(false);
  });

  it.each(["a@b.co", "first.last+tag@example.org"])(
    "accepts email %j",
    (email) => {
      const result = customerDetailsSchema.safeParse({
        ...VALID_CUSTOMER,
        email,
      });
      expect(result.success).toBe(true);
    },
  );

  it.each([
    "not-an-email",
    "a@b",
    "a b@example.com",
    " a@example.com",
    `${"a".repeat(250)}@b.co`,
  ])("rejects email %j", (email) => {
    const result = customerDetailsSchema.safeParse({ ...VALID_CUSTOMER, email });
    expect(result.success).toBe(false);
  });
});

describe("orderIdSchema / orderParamsSchema", () => {
  it("accepts a lowercase UUID", () => {
    expect(orderIdSchema.safeParse(VALID_ORDER_ID).success).toBe(true);
    expect(
      orderParamsSchema.safeParse({ orderId: VALID_ORDER_ID }).success,
    ).toBe(true);
  });

  it.each([
    "",
    "ORD-ABC123",
    VALID_ORDER_ID.toUpperCase(),
    VALID_ORDER_ID.replaceAll("-", ""),
    `${VALID_ORDER_ID}0`,
  ])("rejects orderId %j", (orderId) => {
    expect(orderParamsSchema.safeParse({ orderId }).success).toBe(false);
  });

  it("rejects an unknown params key", () => {
    const result = orderParamsSchema.safeParse({
      orderId: VALID_ORDER_ID,
      extra: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("orderStatusSchema", () => {
  it("accepts only 'placed'", () => {
    expect(orderStatusSchema.safeParse("placed").success).toBe(true);
    for (const status of ["paid", "cancelled", "PLACED", ""]) {
      expect(orderStatusSchema.safeParse(status).success).toBe(false);
    }
  });
});

describe("orderLineSchema", () => {
  it("accepts a snapshot line", () => {
    expect(orderLineSchema.safeParse(VALID_LINE).success).toBe(true);
  });

  // An order line has no availability flag — every line was available at
  // placement (plan.md §3).
  it("rejects an `available` field", () => {
    const result = orderLineSchema.safeParse({ ...VALID_LINE, available: true });
    expect(result.success).toBe(false);
  });

  it.each([0, 100, 1.5])("rejects quantity %s", (quantity) => {
    expect(orderLineSchema.safeParse({ ...VALID_LINE, quantity }).success).toBe(
      false,
    );
  });
});

describe("orderResponseSchema", () => {
  it("accepts a well-formed order", () => {
    expect(orderResponseSchema.safeParse(VALID_ORDER).success).toBe(true);
  });

  it("rejects an order with no items", () => {
    const result = orderResponseSchema.safeParse({
      ...VALID_ORDER,
      items: [],
      itemCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO placedAt", () => {
    const result = orderResponseSchema.safeParse({
      ...VALID_ORDER,
      placedAt: "yesterday",
    });
    expect(result.success).toBe(false);
  });

  // Nothing internal crosses the wire (plan.md §14).
  it.each(["ownerId", "idempotencyKey", "updatedAt", "version"])(
    "rejects an internal %s field",
    (key) => {
      const result = orderResponseSchema.safeParse({
        ...VALID_ORDER,
        [key]: "x",
      });
      expect(result.success).toBe(false);
    },
  );
});
