import { Injectable } from "@nestjs/common";
import type { MenuItemId } from "@contracts/common";
import { CartService } from "../../cart/cart.service";
import { MenuService } from "../../menu/menu.service";
import { NudgeContextSource } from "../domain/nudge-context.source";
import type { NudgeContext, NudgeSurface } from "../domain/nudge.types";

// Builds the nudge context from the two authoritative sources: the caller's
// cart (CartService resolves the owner itself — the client never names a
// cart) and the live menu. Read-only: getCart() and getMenu() change
// nothing (docs/features/mcdelivery-redesign/plan.md, Phase 3).
@Injectable()
export class CommerceNudgeContextAdapter extends NudgeContextSource {
  constructor(
    private readonly cartService: CartService,
    private readonly menuService: MenuService,
  ) {
    super();
  }

  async load(request: {
    readonly surface: NudgeSurface;
    readonly focusItemId?: MenuItemId;
    readonly now: Date;
  }): Promise<NudgeContext> {
    const [cart, menu] = await Promise.all([this.cartService.getCart(), this.menuService.getMenu()]);
    return {
      surface: request.surface,
      ...(request.focusItemId !== undefined && { focusItemId: request.focusItemId }),
      menu: menu.categories.flatMap((category) =>
        category.items.map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          priceCents: item.priceCents,
          available: item.available,
          featured: item.featured ?? [],
          ...(item.imageUrl !== undefined && { imageUrl: item.imageUrl }),
        })),
      ),
      cartItemIds: new Set(cart.items.map((line) => line.itemId)),
      cartSubtotalCents: cart.subtotalCents,
      now: request.now,
    };
  }
}
