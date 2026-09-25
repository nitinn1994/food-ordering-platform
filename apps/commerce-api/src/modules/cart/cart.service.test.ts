import { describe, expect, it } from "vitest";
import type { MenuItemId } from "@contracts/common";
import { cartResponseSchema } from "@contracts/api-contracts";
import { CartCatalog } from "./domain/cart-catalog";
import { CartOwnerResolver } from "./domain/cart-owner.resolver";
import {
  CartItemNotFoundError,
  CartItemQuantityLimitExceededError,
  CartVersionConflictError,
  MenuItemUnavailableError,
  UnknownMenuItemError,
} from "./domain/cart.errors";
import type { CartOwnerId, CatalogItem } from "./domain/cart.types";
import { InMemoryCartRepository } from "./infrastructure/in-memory-cart.repository";
import { CartService } from "./cart.service";

// Fakes for the catalog and owner ports — CartService is constructed with
// nothing concrete except the in-memory repository, whose own contract is
// tested separately (requirements.md AC12). The repository is real here on
// purpose: the version check is part of what the service is being tested
// against.

const ITEMS: Record<string, CatalogItem> = {
  tiramisu: { id: "tiramisu", name: "Tiramisu", priceCents: 750, available: true },
  "garlic-bread": {
    id: "garlic-bread",
    name: "Garlic Bread",
    priceCents: 595,
    available: true,
  },
  gelato: { id: "gelato", name: "Gelato", priceCents: 550, available: false },
};

class FakeCatalog extends CartCatalog {
  readonly items = new Map(Object.entries(ITEMS));

  async findItem(itemId: MenuItemId): Promise<CatalogItem | undefined> {
    return this.items.get(itemId);
  }
}

class FakeOwnerResolver extends CartOwnerResolver {
  constructor(public ownerId: CartOwnerId = "owner-a") {
    super();
  }

  async resolve(): Promise<CartOwnerId> {
    return this.ownerId;
  }
}

function setup() {
  const repository = new InMemoryCartRepository();
  const catalog = new FakeCatalog();
  const owner = new FakeOwnerResolver();
  const service = new CartService(repository, catalog, owner);
  return { service, repository, catalog, owner };
}

describe("CartService", () => {
  describe("getCart (AC1)", () => {
    it("returns an empty cart for an owner with nothing saved, without persisting it", async () => {
      const { service, repository } = setup();

      const cart = await service.getCart();

      expect(cart).toEqual({ items: [], itemCount: 0, subtotalCents: 0 });
      expect(cartResponseSchema.safeParse(cart).success).toBe(true);
      await expect(repository.findByOwner("owner-a")).resolves.toBeUndefined();
    });
  });

  describe("addItem (AC2, AC3, AC4, AC5)", () => {
    it("adds a line and returns the priced cart", async () => {
      const { service } = setup();

      const cart = await service.addItem("tiramisu", 2);

      expect(cart).toEqual({
        items: [
          {
            itemId: "tiramisu",
            name: "Tiramisu",
            unitPriceCents: 750,
            quantity: 2,
            lineSubtotalCents: 1500,
            available: true,
          },
        ],
        itemCount: 2,
        subtotalCents: 1500,
      });
      expect(cartResponseSchema.safeParse(cart).success).toBe(true);
    });

    it("merges a repeated add into one line (2 + 3 = 5) and persists it", async () => {
      const { service } = setup();

      await service.addItem("tiramisu", 2);
      const cart = await service.addItem("tiramisu", 3);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]?.quantity).toBe(5);
      await expect(service.getCart()).resolves.toEqual(cart);
    });

    it("rejects an unknown item with UnknownMenuItemError and leaves the cart unchanged", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 1);

      await expect(service.addItem("does-not-exist", 1)).rejects.toBeInstanceOf(
        UnknownMenuItemError,
      );
      expect((await service.getCart()).items.map((line) => line.itemId)).toEqual([
        "tiramisu",
      ]);
    });

    it("rejects an unavailable item with MenuItemUnavailableError and stores nothing", async () => {
      const { service, repository } = setup();

      await expect(service.addItem("gelato", 1)).rejects.toBeInstanceOf(
        MenuItemUnavailableError,
      );
      await expect(repository.findByOwner("owner-a")).resolves.toBeUndefined();
    });

    it("rejects a merge above 99 and leaves the quantity as it was", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 98);

      await expect(service.addItem("tiramisu", 2)).rejects.toBeInstanceOf(
        CartItemQuantityLimitExceededError,
      );
      expect((await service.getCart()).items[0]?.quantity).toBe(98);
    });
  });

  describe("setItemQuantity (AC6, AC7)", () => {
    it("sets the quantity absolutely", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 2);

      const cart = await service.setItemQuantity("tiramisu", 7);

      expect(cart.items[0]?.quantity).toBe(7);
      expect(cart.subtotalCents).toBe(750 * 7);
    });

    it("rejects an item on the menu but not in the cart", async () => {
      const { service } = setup();

      await expect(
        service.setItemQuantity("garlic-bread", 1),
      ).rejects.toBeInstanceOf(CartItemNotFoundError);
    });

    it("rejects an unknown item before looking at the cart", async () => {
      const { service } = setup();

      await expect(
        service.setItemQuantity("does-not-exist", 1),
      ).rejects.toBeInstanceOf(UnknownMenuItemError);
    });

    it("rejects re-quantifying an item that is now unavailable", async () => {
      const { service, catalog } = setup();
      await service.addItem("tiramisu", 1);
      catalog.items.set("tiramisu", { ...ITEMS.tiramisu!, available: false });

      await expect(service.setItemQuantity("tiramisu", 2)).rejects.toBeInstanceOf(
        MenuItemUnavailableError,
      );
    });
  });

  describe("removeItem (AC7, AC8)", () => {
    it("removes the whole line and recomputes totals", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 2);
      await service.addItem("garlic-bread", 3);

      const cart = await service.removeItem("tiramisu");

      expect(cart.items.map((line) => line.itemId)).toEqual(["garlic-bread"]);
      expect(cart.itemCount).toBe(3);
      expect(cart.subtotalCents).toBe(595 * 3);
    });

    it("rejects an item not in the cart", async () => {
      const { service } = setup();

      await expect(service.removeItem("tiramisu")).rejects.toBeInstanceOf(
        CartItemNotFoundError,
      );
    });

    it("removes a line even if its item has since become unavailable", async () => {
      const { service, catalog } = setup();
      await service.addItem("tiramisu", 1);
      catalog.items.set("tiramisu", { ...ITEMS.tiramisu!, available: false });

      await expect(service.removeItem("tiramisu")).resolves.toEqual({
        items: [],
        itemCount: 0,
        subtotalCents: 0,
      });
    });
  });

  describe("clearCart (AC16)", () => {
    it("empties the cart", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 2);
      await service.addItem("garlic-bread", 1);

      await expect(service.clearCart()).resolves.toEqual({
        items: [],
        itemCount: 0,
        subtotalCents: 0,
      });
      expect((await service.getCart()).items).toEqual([]);
    });
  });

  describe("pricing is live (AC11, OD4)", () => {
    it("reflects the catalog's current price on every read", async () => {
      const { service, catalog } = setup();
      await service.addItem("tiramisu", 2);
      catalog.items.set("tiramisu", { ...ITEMS.tiramisu!, priceCents: 800 });

      const cart = await service.getCart();

      expect(cart.items[0]?.unitPriceCents).toBe(800);
      expect(cart.subtotalCents).toBe(1600);
    });
  });

  describe("owner comes only from the resolver (AC10)", () => {
    it("acts on whichever cart the resolver names, and no other", async () => {
      const { service, owner } = setup();
      await service.addItem("tiramisu", 2);

      owner.ownerId = "owner-b";
      expect((await service.getCart()).items).toEqual([]);

      owner.ownerId = "owner-a";
      expect((await service.getCart()).items).toHaveLength(1);
    });
  });

  describe("concurrent writes (AC13, OD10)", () => {
    // Deterministic interleaving, no timers: both requests read the cart
    // before either saves — the lost-update case. One must win; the other
    // must be rejected with a conflict, not silently overwrite it.
    it("rejects the second of two writes based on the same read", async () => {
      class GatedRepository extends InMemoryCartRepository {
        release!: () => void;
        private readonly gate = new Promise<void>((resolve) => {
          this.release = resolve;
        });

        override async findByOwner(ownerId: CartOwnerId) {
          const cart = await super.findByOwner(ownerId);
          await this.gate;
          return cart;
        }
      }
      const repository = new GatedRepository();
      const service = new CartService(
        repository,
        new FakeCatalog(),
        new FakeOwnerResolver(),
      );

      const first = service.addItem("tiramisu", 1);
      const second = service.addItem("garlic-bread", 1);
      repository.release();
      const results = await Promise.allSettled([first, second]);

      const rejected = results.filter((result) => result.status === "rejected");
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        CartVersionConflictError,
      );
    });
  });

  // Phase 9 additions (docs/features/phase-9-order-domain/plan.md §22).
  describe("prepareCheckout", () => {
    it("returns the priced lines, the owner, and the version to consume at", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 2);
      await service.addItem("garlic-bread", 1);

      await expect(service.prepareCheckout()).resolves.toEqual({
        ownerId: "owner-a",
        version: 2,
        lines: [
          {
            itemId: "tiramisu",
            name: "Tiramisu",
            unitPriceCents: 750,
            quantity: 2,
            lineSubtotalCents: 1500,
            available: true,
          },
          {
            itemId: "garlic-bread",
            name: "Garlic Bread",
            unitPriceCents: 595,
            quantity: 1,
            lineSubtotalCents: 595,
            available: true,
          },
        ],
        unpricedLineCount: 0,
      });
    });

    it("returns an empty snapshot at version 0 for an owner with nothing saved", async () => {
      const { service } = setup();

      await expect(service.prepareCheckout()).resolves.toEqual({
        ownerId: "owner-a",
        version: 0,
        lines: [],
        unpricedLineCount: 0,
      });
    });

    it("prices from the catalog's current values", async () => {
      const { service, catalog } = setup();
      await service.addItem("tiramisu", 2);
      catalog.items.set("tiramisu", { ...ITEMS.tiramisu!, priceCents: 800 });

      const checkout = await service.prepareCheckout();

      expect(checkout.lines[0]?.unitPriceCents).toBe(800);
      expect(checkout.lines[0]?.lineSubtotalCents).toBe(1600);
    });

    it("flags an unavailable line rather than dropping it", async () => {
      const { service, catalog } = setup();
      await service.addItem("tiramisu", 1);
      catalog.items.set("tiramisu", { ...ITEMS.tiramisu!, available: false });

      const checkout = await service.prepareCheckout();

      expect(checkout.lines[0]?.available).toBe(false);
      expect(checkout.unpricedLineCount).toBe(0);
    });

    it("counts a stored line whose item left the menu, which the priced view drops", async () => {
      const { service, catalog } = setup();
      await service.addItem("tiramisu", 1);
      await service.addItem("garlic-bread", 1);
      catalog.items.delete("garlic-bread");

      const checkout = await service.prepareCheckout();

      expect(checkout.lines.map((line) => line.itemId)).toEqual(["tiramisu"]);
      expect(checkout.unpricedLineCount).toBe(1);
    });
  });

  describe("completeCheckout", () => {
    it("clears the cart when it is still at the expected version", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 2);
      const { version } = await service.prepareCheckout();

      await service.completeCheckout(version);

      expect((await service.getCart()).items).toEqual([]);
      expect((await service.prepareCheckout()).version).toBe(version + 1);
    });

    it("rejects a stale version and leaves the cart unchanged", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 2);
      const { version } = await service.prepareCheckout();
      await service.addItem("garlic-bread", 1);

      await expect(service.completeCheckout(version)).rejects.toBeInstanceOf(
        CartVersionConflictError,
      );
      expect((await service.getCart()).items.map((line) => line.itemId)).toEqual([
        "tiramisu",
        "garlic-bread",
      ]);
    });

    it("lets only one of two completions at the same version succeed", async () => {
      const { service } = setup();
      await service.addItem("tiramisu", 2);
      const { version } = await service.prepareCheckout();

      await service.completeCheckout(version);

      await expect(service.completeCheckout(version)).rejects.toBeInstanceOf(
        CartVersionConflictError,
      );
    });
  });
});
