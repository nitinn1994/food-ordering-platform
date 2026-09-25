import { Injectable } from "@nestjs/common";
import { CartOwnerResolver } from "../../cart/domain/cart-owner.resolver";
import { OrderOwnerResolver } from "../domain/order-owner.resolver";
import type { OrderOwnerId } from "../domain/order.types";

// Answers the Order domain's OrderOwnerResolver by asking Cart's
// CartOwnerResolver (exported by CartModule), so there is exactly one
// identity binding for both domains: an order's owner is always the owner
// of the cart it was placed from, and the authentication phase replaces one
// useClass, not two (docs/features/phase-9-order-domain/plan.md §22).
@Injectable()
export class CartOwnerAdapter extends OrderOwnerResolver {
  constructor(private readonly cartOwnerResolver: CartOwnerResolver) {
    super();
  }

  async resolve(): Promise<OrderOwnerId> {
    return this.cartOwnerResolver.resolve();
  }
}
