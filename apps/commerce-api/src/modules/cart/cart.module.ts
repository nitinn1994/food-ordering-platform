import { Module } from "@nestjs/common";
import { MenuModule } from "../menu/menu.module";
import { CartCatalog } from "./domain/cart-catalog";
import { CartOwnerResolver } from "./domain/cart-owner.resolver";
import { CartRepository } from "./domain/cart.repository";
import { PostgresCartRepository } from "./infrastructure/postgres-cart.repository";
import { MenuCatalogAdapter } from "./infrastructure/menu-catalog.adapter";
import { SingleUserCartOwnerResolver } from "./infrastructure/single-user-cart-owner.resolver";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

// The second domain module and the first with writes. The three bindings
// below are the only place storage, menu source, and cart identity are
// chosen (docs/features/phase-8-cart-domain/plan.md §16, §9, §5): a
// database, a different catalog, or authenticated identity is a change to
// one `useClass` here, not to CartService or the domain.
//
// Imports MenuModule for its exported MenuService, which only
// MenuCatalogAdapter uses — Cart never touches Menu's repository or seed.
//
// Phase 10: carts are stored in PostgreSQL (DatabaseModule is global).
// InMemoryCartRepository remains as the test adapter
// (docs/features/phase-10-database-persistence/plan.md §9, OD3).
@Module({
  imports: [MenuModule],
  controllers: [CartController],
  providers: [
    CartService,
    { provide: CartRepository, useClass: PostgresCartRepository },
    { provide: CartCatalog, useClass: MenuCatalogAdapter },
    { provide: CartOwnerResolver, useClass: SingleUserCartOwnerResolver },
  ],
  // For the Order module (Phase 9): CartService for prepareCheckout /
  // completeCheckout, and CartOwnerResolver so Cart and Order share one
  // identity binding — the authentication phase replaces the useClass above
  // and both domains follow (docs/features/phase-9-order-domain/plan.md §22).
  exports: [CartService, CartOwnerResolver],
})
export class CartModule {}
