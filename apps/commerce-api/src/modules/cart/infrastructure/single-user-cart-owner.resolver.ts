import { Injectable } from "@nestjs/common";
import { CartOwnerResolver } from "../domain/cart-owner.resolver";
import type { CartOwnerId } from "../domain/cart.types";

// The one owner that exists while the system is single-user (CLAUDE.md;
// Phase 5 D13). Exported so tests can assert against it.
export const SINGLE_USER_CART_OWNER_ID: CartOwnerId = "local-dev-owner";

// The Phase 8 CartOwnerResolver: every request acts on the same cart. This
// is exactly as isolated as the system actually is today — any local
// process can call commerce-api (system-architecture.md §8 gap 4) — and it
// reads nothing from the request, so there is no client-controlled identity
// to spoof (docs/features/phase-8-cart-domain/plan.md §5, OD3;
// requirements.md AC10). The authentication phase replaces this binding in
// CartModule; nothing else changes.
@Injectable()
export class SingleUserCartOwnerResolver extends CartOwnerResolver {
  async resolve(): Promise<CartOwnerId> {
    return SINGLE_USER_CART_OWNER_ID;
  }
}
