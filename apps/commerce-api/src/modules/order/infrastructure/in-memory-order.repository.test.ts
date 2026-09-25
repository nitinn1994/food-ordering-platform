import { describe, expect, it } from "vitest";
import { OrderAlreadyExistsError } from "../domain/order.errors";
import { OrderInvariantViolationError } from "../domain/order.invariants";
import type { Order } from "../domain/order.types";
import { InMemoryOrderRepository } from "./in-memory-order.repository";

const T0 = new Date("2026-09-25T12:00:00.000Z");

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c",
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
    ],
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

describe("InMemoryOrderRepository", () => {
  it("returns undefined for an order that was never stored", async () => {
    const repository = new InMemoryOrderRepository();
    await expect(
      repository.findById("owner-a", order().id),
    ).resolves.toBeUndefined();
    await expect(
      repository.findByIdempotencyKey("owner-a", "key-1"),
    ).resolves.toBeUndefined();
  });

  it("finds a stored order by id and by idempotency key", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(order());

    await expect(repository.findById("owner-a", order().id)).resolves.toEqual(
      order(),
    );
    await expect(
      repository.findByIdempotencyKey("owner-a", "key-1"),
    ).resolves.toEqual(order());
  });

  // Every read is owner-scoped: another owner's order is not found.
  it("never returns an order through another owner's id", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(order());

    await expect(
      repository.findById("owner-b", order().id),
    ).resolves.toBeUndefined();
    await expect(
      repository.findByIdempotencyKey("owner-b", "key-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects a second order with the same id and stores nothing", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(order());

    await expect(
      repository.create(order({ idempotencyKey: "key-2" })),
    ).rejects.toBeInstanceOf(OrderAlreadyExistsError);
    await expect(
      repository.findByIdempotencyKey("owner-a", "key-2"),
    ).resolves.toBeUndefined();
  });

  it("rejects a second order with the same owner and idempotency key", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(order());
    const otherId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

    await expect(
      repository.create(order({ id: otherId })),
    ).rejects.toBeInstanceOf(OrderAlreadyExistsError);
    await expect(
      repository.findById("owner-a", otherId),
    ).resolves.toBeUndefined();
  });

  it("allows the same idempotency key under a different owner", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(order());
    const otherId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

    await repository.create(order({ id: otherId, ownerId: "owner-b" }));

    await expect(
      repository.findByIdempotencyKey("owner-b", "key-1"),
    ).resolves.toMatchObject({ id: otherId });
  });

  it("does not let an owner/key pair collide with another through its characters", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(order({ ownerId: "a", idempotencyKey: "b,c" }));

    await expect(
      repository.findByIdempotencyKey("a,b", "c"),
    ).resolves.toBeUndefined();
  });

  it("rejects an order that breaks an invariant", async () => {
    const repository = new InMemoryOrderRepository();
    await expect(
      repository.create(order({ totalCents: 1 })),
    ).rejects.toBeInstanceOf(OrderInvariantViolationError);
  });

  // AC9: a returned order is immutable, and a caller cannot reach stored
  // state through the object it passed in or the one it got back.
  it("returns frozen copies and is isolated from the caller's objects", async () => {
    const repository = new InMemoryOrderRepository();
    const input = structuredClone(order()) as {
      lines: { unitPriceCents: number }[];
    } & Order;
    await repository.create(input);
    input.lines[0]!.unitPriceCents = 1;

    const found = await repository.findById("owner-a", order().id);

    expect(found?.lines[0]?.unitPriceCents).toBe(750);
    expect(() => {
      (found!.lines[0] as { unitPriceCents: number }).unitPriceCents = 2;
    }).toThrow(TypeError);
    expect(() => {
      (found!.customer as { fullName: string }).fullName = "x";
    }).toThrow(TypeError);
    const again = await repository.findById("owner-a", order().id);
    expect(again?.lines[0]?.unitPriceCents).toBe(750);
  });
});
