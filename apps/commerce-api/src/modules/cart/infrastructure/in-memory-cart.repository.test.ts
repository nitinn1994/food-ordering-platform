import { describe, expect, it } from "vitest";
import { CartVersionConflictError } from "../domain/cart.errors";
import { CartInvariantViolationError } from "../domain/cart.invariants";
import { addLine, emptyCart } from "../domain/cart.operations";
import type { Cart } from "../domain/cart.types";
import { InMemoryCartRepository } from "./in-memory-cart.repository";

const T0 = new Date("2026-09-25T10:00:00.000Z");

function firstCart(ownerId = "owner-a"): Cart {
  return addLine(emptyCart(ownerId, T0), "tiramisu", 2, T0); // version 1
}

describe("InMemoryCartRepository", () => {
  it("returns undefined for an owner with no saved cart", async () => {
    const repository = new InMemoryCartRepository();
    await expect(repository.findByOwner("owner-a")).resolves.toBeUndefined();
  });

  it("round-trips a saved cart", async () => {
    const repository = new InMemoryCartRepository();
    const cart = firstCart();

    await repository.save(cart);

    await expect(repository.findByOwner("owner-a")).resolves.toEqual(cart);
  });

  it("keeps owners' carts separate", async () => {
    const repository = new InMemoryCartRepository();
    await repository.save(firstCart("owner-a"));

    await expect(repository.findByOwner("owner-b")).resolves.toBeUndefined();
  });

  describe("optimistic version check (AC13, OD10)", () => {
    it("rejects a first save whose version is not 1", async () => {
      const repository = new InMemoryCartRepository();
      const cart = { ...firstCart(), version: 2 };

      await expect(repository.save(cart)).rejects.toBeInstanceOf(
        CartVersionConflictError,
      );
      await expect(repository.findByOwner("owner-a")).resolves.toBeUndefined();
    });

    it("accepts a save exactly one version ahead of the stored one", async () => {
      const repository = new InMemoryCartRepository();
      const v1 = firstCart();
      await repository.save(v1);

      const v2 = addLine(v1, "tiramisu", 1, T0);
      await repository.save(v2);

      expect((await repository.findByOwner("owner-a"))?.version).toBe(2);
    });

    it("rejects the second of two writes based on the same read (lost update)", async () => {
      const repository = new InMemoryCartRepository();
      await repository.save(firstCart());

      const readByA = (await repository.findByOwner("owner-a"))!;
      const readByB = (await repository.findByOwner("owner-a"))!;

      await repository.save(addLine(readByA, "tiramisu", 1, T0));
      await expect(
        repository.save(addLine(readByB, "garlic-bread", 1, T0)),
      ).rejects.toBeInstanceOf(CartVersionConflictError);

      // A's write survived intact; B's stored nothing.
      const stored = await repository.findByOwner("owner-a");
      expect(stored?.lines).toEqual([{ itemId: "tiramisu", quantity: 3 }]);
    });

    it("maps a conflict to 409 CART_CONFLICT", async () => {
      const repository = new InMemoryCartRepository();
      await expect(
        repository.save({ ...firstCart(), version: 5 }),
      ).rejects.toMatchObject({ status: 409, code: "CART_CONFLICT" });
    });
  });

  it("rejects a cart that breaks an invariant", async () => {
    const repository = new InMemoryCartRepository();
    const broken: Cart = {
      ...firstCart(),
      lines: [
        { itemId: "tiramisu", quantity: 1 },
        { itemId: "tiramisu", quantity: 1 },
      ],
    };
    await expect(repository.save(broken)).rejects.toBeInstanceOf(
      CartInvariantViolationError,
    );
  });

  describe("isolation of stored state (AC13)", () => {
    it("returns a frozen cart; mutating it throws", async () => {
      const repository = new InMemoryCartRepository();
      await repository.save(firstCart());
      const cart = (await repository.findByOwner("owner-a"))!;

      expect(() => {
        (cart.lines as { itemId: string; quantity: number }[]).push({
          itemId: "garlic-bread",
          quantity: 1,
        });
      }).toThrow(TypeError);
      expect(() => {
        (cart.lines[0] as { quantity: number }).quantity = 50;
      }).toThrow(TypeError);
    });

    it("is unaffected by later mutation of the object passed to save()", async () => {
      const repository = new InMemoryCartRepository();
      const cart = {
        ...firstCart(),
        lines: [{ itemId: "tiramisu", quantity: 2 }],
      };
      await repository.save(cart);

      cart.lines[0]!.quantity = 50;

      const stored = await repository.findByOwner("owner-a");
      expect(stored?.lines[0]?.quantity).toBe(2);
    });
  });
});
