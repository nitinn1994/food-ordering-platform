import { Module } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { CheckoutCart } from "./domain/checkout-cart";
import { OrderIdGenerator } from "./domain/order-id.generator";
import { OrderOwnerResolver } from "./domain/order-owner.resolver";
import { OrderRepository } from "./domain/order.repository";
import { CartCheckoutAdapter } from "./infrastructure/cart-checkout.adapter";
import { CartOwnerAdapter } from "./infrastructure/cart-owner.adapter";
import { InMemoryOrderRepository } from "./infrastructure/in-memory-order.repository";
import { UuidOrderIdGenerator } from "./infrastructure/uuid-order-id.generator";
import { OrderController } from "./order.controller";
import { OrderService } from "./order.service";

// The third domain module. The four bindings below are the only place
// storage, cart source, identity, and id minting are chosen
// (docs/features/phase-9-order-domain/plan.md §17, §22, OD13): a database
// or a different id scheme is a change to one `useClass` here, not to
// OrderService or the domain.
//
// Imports CartModule for its exported CartService and CartOwnerResolver,
// which only the two Cart adapters use — Order never touches Cart's
// repository, pricing, or Menu. Identity is not bound here at all: the
// owner is whatever CartModule's CartOwnerResolver says.
@Module({
  imports: [CartModule],
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: InMemoryOrderRepository },
    { provide: CheckoutCart, useClass: CartCheckoutAdapter },
    { provide: OrderOwnerResolver, useClass: CartOwnerAdapter },
    { provide: OrderIdGenerator, useClass: UuidOrderIdGenerator },
  ],
})
export class OrderModule {}
