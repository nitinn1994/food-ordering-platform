import type { TestingModuleBuilder } from "@nestjs/testing";
import { InMemoryTransactionRunner } from "../../src/common/persistence/in-memory-transaction-runner";
import { TransactionRunner } from "../../src/common/persistence/transaction-runner";
import { DatabaseClient } from "../../src/database/database-client";
import { CartRepository } from "../../src/modules/cart/domain/cart.repository";
import { InMemoryCartRepository } from "../../src/modules/cart/infrastructure/in-memory-cart.repository";
import { OrderRepository } from "../../src/modules/order/domain/order.repository";
import { InMemoryOrderRepository } from "../../src/modules/order/infrastructure/in-memory-order.repository";
import { MenuRepository } from "../../src/modules/menu/domain/menu.repository";
import { InMemoryMenuRepository } from "../../src/modules/menu/infrastructure/in-memory-menu.repository";

// Keeps the pre-existing HTTP e2e suites database-free
// (docs/features/phase-10-database-persistence/plan.md §20, OD12): they
// start the real AppModule, whose DatabaseModule would otherwise try to
// reach Postgres at boot. The full stack against a real database is
// covered separately by the DB suite (test/*.db.test.ts).
//
// The connection is replaced with one that refuses every use, and each
// repository port a module has switched to Postgres is bound back to its
// in-memory adapter: Menu, Cart and Order, plus the pass-through
// TransactionRunner (which gives no atomicity — atomicity is proven against
// the real database instead).
//
// Also used by module tests under src/ that compile a domain module and
// exercise it end to end without a database.
const DATABASE_FREE_CLIENT = {
  executor(): never {
    throw new Error("No database in the DB-free test suite.");
  },
  transaction(): never {
    throw new Error("No database in the DB-free test suite.");
  },
};

export function withInMemoryPersistence(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  return builder
    .overrideProvider(DatabaseClient)
    .useValue(DATABASE_FREE_CLIENT)
    .overrideProvider(MenuRepository)
    .useClass(InMemoryMenuRepository)
    .overrideProvider(CartRepository)
    .useClass(InMemoryCartRepository)
    .overrideProvider(OrderRepository)
    .useClass(InMemoryOrderRepository)
    .overrideProvider(TransactionRunner)
    .useClass(InMemoryTransactionRunner);
}
