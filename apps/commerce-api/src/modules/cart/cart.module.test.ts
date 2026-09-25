import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { CartCatalog } from "./domain/cart-catalog";
import { CartOwnerResolver } from "./domain/cart-owner.resolver";
import { CartRepository } from "./domain/cart.repository";
import { InMemoryCartRepository } from "./infrastructure/in-memory-cart.repository";
import { MenuCatalogAdapter } from "./infrastructure/menu-catalog.adapter";
import {
  SINGLE_USER_CART_OWNER_ID,
  SingleUserCartOwnerResolver,
} from "./infrastructure/single-user-cart-owner.resolver";
import { CartController } from "./cart.controller";
import { CartModule } from "./cart.module";
import { CartService } from "./cart.service";

// Constructor injection by abstract-class token, no @Inject() — the same
// toolchain proof menu.module.test.ts gives MenuModule, here for three
// ports at once (requirements.md AC12).
describe("CartModule", () => {
  it("resolves the controller, service, and each port to its Phase 8 adapter", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CartModule],
    }).compile();

    expect(moduleRef.get(CartController)).toBeInstanceOf(CartController);
    expect(moduleRef.get(CartService)).toBeInstanceOf(CartService);
    expect(moduleRef.get(CartRepository)).toBeInstanceOf(InMemoryCartRepository);
    expect(moduleRef.get(CartCatalog)).toBeInstanceOf(MenuCatalogAdapter);
    expect(moduleRef.get(CartOwnerResolver)).toBeInstanceOf(
      SingleUserCartOwnerResolver,
    );
  });

  // AC10: the bound resolver names the one fixed owner, and nothing else.
  it("resolves every request to the single fixed owner", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CartModule],
    }).compile();

    await expect(moduleRef.get(CartOwnerResolver).resolve()).resolves.toBe(
      SINGLE_USER_CART_OWNER_ID,
    );
  });

  it("adds a seeded menu item through the compiled module end to end", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CartModule],
    }).compile();

    const cart = await moduleRef
      .get(CartController)
      .addItem({ itemId: "tiramisu", quantity: 2 });

    expect(cart.subtotalCents).toBe(1500);
  });

  // Phase 9: the Order module injects both from outside CartModule
  // (docs/features/phase-9-order-domain/plan.md §22).
  it("exports CartService and CartOwnerResolver to an importing module", async () => {
    @Injectable()
    class Consumer {
      constructor(
        readonly cartService: CartService,
        readonly cartOwnerResolver: CartOwnerResolver,
      ) {}
    }

    @Module({ imports: [CartModule], providers: [Consumer] })
    class ConsumerModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [ConsumerModule],
    }).compile();
    const consumer = moduleRef.get(Consumer);

    expect(consumer.cartService).toBeInstanceOf(CartService);
    expect(consumer.cartOwnerResolver).toBeInstanceOf(SingleUserCartOwnerResolver);
    expect(consumer.cartService).toBe(moduleRef.get(CartService));
  });
});
