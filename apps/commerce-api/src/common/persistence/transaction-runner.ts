// The unit-of-work port: runs `work` so that every repository write inside
// it commits together or not at all
// (docs/features/phase-10-database-persistence/plan.md §12, OD4). An
// abstract class so it doubles as its own Nest DI token — the convention
// every repository port already follows.
//
// Repositories join the transaction implicitly (the Postgres adapter keeps
// it in AsyncLocalStorage — src/database/database-client.ts), so no port,
// service signature, or domain type carries a transaction handle. A nested
// `run` joins the outer transaction rather than opening a second one.
//
// Only one use case opens a transaction today: OrderService.placeOrder,
// around consuming the cart and storing the order (ADR-0016).
export abstract class TransactionRunner {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
