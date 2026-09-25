import { Injectable } from "@nestjs/common";
import { CartVersionConflictError } from "../../cart/domain/cart.errors";
import { CartService } from "../../cart/cart.service";
import { CheckoutCart } from "../domain/checkout-cart";
import { CheckoutCartConflictError } from "../domain/order.errors";
import type { CheckoutSnapshot } from "../domain/order.types";

// Answers the Order domain's CheckoutCart port from the Cart module's
// exported CartService — together with cart-owner.adapter.ts, the only
// files in the Order module that know Cart exists
// (docs/features/phase-9-order-domain/plan.md §22, OD1). It copies exactly
// the fields Order needs, and translates Cart's version conflict into
// Order's own error so the Order domain never sees a Cart type.
@Injectable()
export class CartCheckoutAdapter extends CheckoutCart {
  constructor(private readonly cartService: CartService) {
    super();
  }

  async load(): Promise<CheckoutSnapshot> {
    const checkout = await this.cartService.prepareCheckout();
    return {
      ownerId: checkout.ownerId,
      version: checkout.version,
      lines: checkout.lines.map((line) => ({
        itemId: line.itemId,
        name: line.name,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        lineSubtotalCents: line.lineSubtotalCents,
        available: line.available,
      })),
      unpricedLineCount: checkout.unpricedLineCount,
    };
  }

  async consume(expectedVersion: number): Promise<void> {
    try {
      await this.cartService.completeCheckout(expectedVersion);
    } catch (error) {
      if (error instanceof CartVersionConflictError) {
        throw new CheckoutCartConflictError();
      }
      throw error;
    }
  }
}
