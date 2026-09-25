import { describe, expect, it } from "vitest";
import type { MenuItemId } from "@contracts/common";
import { CartCatalog } from "../../cart/domain/cart-catalog";
import { CartOwnerResolver } from "../../cart/domain/cart-owner.resolver";
import type { CartOwnerId, CatalogItem } from "../../cart/domain/cart.types";
import { InMemoryCartRepository } from "../../cart/infrastructure/in-memory-cart.repository";
import { CartService } from "../../cart/cart.service";
import { CheckoutCartConflictError } from "../domain/order.errors";
import { CartCheckoutAdapter } from "./cart-checkout.adapter";
import { CartOwnerAdapter } from "./cart-owner.adapter";

// A real CartService over a real in-memory cart repository — the adapter's
// job is translation, and the version behaviour it relies on is Cart's.

class FakeCatalog extends CartCatalog {
  readonly items = new Map<MenuItemId, CatalogItem>([
    ["tiramisu", { id: "tiramisu", name: "Tiramisu", priceCents: 750, available: true }],
  ]);

  async findItem(itemId: MenuItemId): Promise<CatalogItem | undefined> {
    return this.items.get(itemId);
  }
}

class FakeOwnerResolver extends CartOwnerResolver {
  async resolve(): Promise<CartOwnerId> {
    return "owner-a";
  }
}

function setup() {
  const cartService = new CartService(
    new InMemoryCartRepository(),
    new FakeCatalog(),
    new FakeOwnerResolver(),
  );
  return { cartService, adapter: new CartCheckoutAdapter(cartService) };
}

describe("CartCheckoutAdapter (OD1)", () => {
  it("loads the priced cart as a CheckoutSnapshot", async () => {
    const { cartService, adapter } = setup();
    await cartService.addItem("tiramisu", 2);

    await expect(adapter.load()).resolves.toEqual({
      ownerId: "owner-a",
      version: 1,
      lines: [
        {
          itemId: "tiramisu",
          name: "Tiramisu",
          unitPriceCents: 750,
          quantity: 2,
          lineSubtotalCents: 1500,
          available: true,
        },
      ],
      unpricedLineCount: 0,
    });
  });

  it("consumes the cart at the loaded version", async () => {
    const { cartService, adapter } = setup();
    await cartService.addItem("tiramisu", 2);
    const { version } = await adapter.load();

    await adapter.consume(version);

    expect((await cartService.getCart()).items).toEqual([]);
  });

  it("translates Cart's version conflict into Order's own conflict error", async () => {
    const { cartService, adapter } = setup();
    await cartService.addItem("tiramisu", 2);
    const { version } = await adapter.load();
    await cartService.setItemQuantity("tiramisu", 3);

    const consumed = adapter.consume(version);

    await expect(consumed).rejects.toBeInstanceOf(CheckoutCartConflictError);
    await expect(consumed).rejects.toMatchObject({
      status: 409,
      code: "CART_CONFLICT",
    });
    expect((await cartService.getCart()).items[0]?.quantity).toBe(3);
  });
});

describe("CartOwnerAdapter", () => {
  it("resolves to the Cart owner resolver's owner", async () => {
    await expect(
      new CartOwnerAdapter(new FakeOwnerResolver()).resolve(),
    ).resolves.toBe("owner-a");
  });
});
