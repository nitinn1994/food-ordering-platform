import { Injectable } from "@nestjs/common";
import type { MenuItemId, Quantity } from "@contracts/common";
import type { CartResponse } from "@contracts/api-contracts";
import { CartCatalog } from "./domain/cart-catalog";
import { CartOwnerResolver } from "./domain/cart-owner.resolver";
import { MenuItemUnavailableError, UnknownMenuItemError } from "./domain/cart.errors";
import {
  addLine,
  clearLines,
  emptyCart,
  removeLine,
  setLineQuantity,
} from "./domain/cart.operations";
import { priceCart } from "./domain/cart.pricing";
import { CartRepository } from "./domain/cart.repository";
import type { Cart, CatalogItem } from "./domain/cart.types";
import { toCartResponse } from "./cart.mapper";

// The Cart domain's use cases — orchestration only; the rules live in
// domain/ (docs/features/phase-8-cart-domain/plan.md §21). Depends on three
// abstract ports and nothing concrete (requirements.md AC12), so storage,
// menu source, and identity are each a binding change in CartModule.
//
// Every mutation follows the same shape: resolve the owner → validate the
// item against the catalog (add and set only) → load or start empty →
// apply a pure domain operation → save (version-checked; a stale write
// throws CartVersionConflictError and nothing is stored) → price from the
// catalog's current values → map. Nothing retries a conflict internally
// (plan.md §19, OD10).
@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly cartCatalog: CartCatalog,
    private readonly cartOwnerResolver: CartOwnerResolver,
  ) {}

  async getCart(): Promise<CartResponse> {
    return this.price(await this.loadCart());
  }

  async addItem(itemId: MenuItemId, quantity: Quantity): Promise<CartResponse> {
    await this.requireOrderableItem(itemId);
    const cart = await this.loadCart();
    return this.commit(addLine(cart, itemId, quantity, new Date()));
  }

  async setItemQuantity(
    itemId: MenuItemId,
    quantity: Quantity,
  ): Promise<CartResponse> {
    await this.requireOrderableItem(itemId);
    const cart = await this.loadCart();
    return this.commit(setLineQuantity(cart, itemId, quantity, new Date()));
  }

  // No catalog check: removing a line never requires the item to still be
  // on sale (plan.md §9).
  async removeItem(itemId: MenuItemId): Promise<CartResponse> {
    const cart = await this.loadCart();
    return this.commit(removeLine(cart, itemId, new Date()));
  }

  // Not exposed over HTTP and not an intent (plan.md OD5; ADR-0011, Phase 5
  // D7) — the Order phase is its first real caller.
  async clearCart(): Promise<CartResponse> {
    const cart = await this.loadCart();
    return this.commit(clearLines(cart, new Date()));
  }

  // Unknown → 404 MENU_ITEM_NOT_FOUND; known but unavailable → 422
  // MENU_ITEM_UNAVAILABLE (plan.md §9, OD13). Checked before the cart is
  // loaded, so a rejected request never touches cart state.
  private async requireOrderableItem(itemId: MenuItemId): Promise<void> {
    const item = await this.cartCatalog.findItem(itemId);
    if (!item) {
      throw new UnknownMenuItemError();
    }
    if (!item.available) {
      throw new MenuItemUnavailableError();
    }
  }

  // The owner comes only from the resolver — never from the request
  // (plan.md §5, AC10). An owner with no stored cart gets an empty one,
  // which is not persisted by a read (plan.md §14).
  private async loadCart(): Promise<Cart> {
    const ownerId = await this.cartOwnerResolver.resolve();
    return (
      (await this.cartRepository.findByOwner(ownerId)) ??
      emptyCart(ownerId, new Date())
    );
  }

  private async commit(next: Cart): Promise<CartResponse> {
    await this.cartRepository.save(next);
    return this.price(next);
  }

  // Every line is priced from the catalog's *current* values on every
  // response (plan.md §10, OD4). At most one lookup per line; a cart holds
  // at most one line per menu item.
  private async price(cart: Cart): Promise<CartResponse> {
    const entries = await Promise.all(
      cart.lines.map(
        async (line) =>
          [line.itemId, await this.cartCatalog.findItem(line.itemId)] as const,
      ),
    );
    const catalog = new Map<MenuItemId, CatalogItem>();
    for (const [itemId, item] of entries) {
      if (item) {
        catalog.set(itemId, item);
      }
    }
    return toCartResponse(priceCart(cart.lines, catalog));
  }
}
