import { AsyncLocalStorage } from "node:async_hooks";
import {
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";
import type { AppConfig } from "../config/env.schema";
import type { DatabaseSchema } from "./database.schema";
import { describeDriverError, toPersistenceError } from "./persistence.errors";

// Fixed, not configurable yet (docs/features/phase-10-database-persistence/
// plan.md §15): a connection attempt and a single statement are both
// bounded, so a stuck database surfaces as an error rather than a request
// that never finishes.
const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 10_000;
const APPLICATION_NAME = "commerce-api";

type Database = Kysely<DatabaseSchema>;
export type DatabaseExecutor = Kysely<DatabaseSchema>;

// Builds the connection pool and Kysely instance for a validated config.
// Shared by DatabaseModule (the running API), the db:* scripts
// (src/database/cli/), and the DB test suite, so all three connect the same
// way. pg.Pool connects lazily: nothing touches the network until the
// first query.
export function createDatabase(config: AppConfig): Database {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    application_name: APPLICATION_NAME,
  });
  // An idle pooled connection that drops (e.g. the database restarts)
  // emits 'error' on the pool, and an unhandled 'error' event would crash
  // the process. The next query simply opens a fresh connection; this only
  // records that it happened — the code, never the driver's message.
  pool.on("error", (error) => {
    const { code } = describeDriverError(error);
    new Logger("DatabasePool").warn(
      `Idle database connection lost (code ${code ?? "unknown"})`,
    );
  });
  // pg-pool removes that listener from a client while it is checked out, so
  // a connection the database ends *between* two statements of a checked-out
  // client — typically inside an open transaction, before COMMIT — emits
  // 'error' with no listener: an uncaught exception that would crash the
  // process (review-report.md #8). Each client gets its own listener, once.
  // The error itself still reaches the caller: the client's next statement
  // fails, is mapped to 503 (persistence.errors.ts), and pg-pool discards
  // the client on release.
  const guarded = new WeakSet<pg.PoolClient>();
  pool.on("acquire", (client) => {
    if (guarded.has(client)) {
      return;
    }
    guarded.add(client);
    client.on("error", (error) => {
      const { code } = describeDriverError(error);
      new Logger("DatabasePool").warn(
        `In-use database connection lost (code ${code ?? "unknown"})`,
      );
    });
  });
  return new Kysely<DatabaseSchema>({ dialect: new PostgresDialect({ pool }) });
}

// The one owner of the database connection inside the running API
// (plan.md §9, §12, §15). Repositories depend on this, never on `pg` or on
// a Kysely instance directly.
//
// Transactions are ambient: `transaction(work)` runs `work` with the open
// Kysely Transaction stored in AsyncLocalStorage, and `executor()` returns
// it to any repository called from inside `work` — so CartRepository.save
// and OrderRepository.create join the same transaction without either port
// carrying a handle. Outside `transaction`, `executor()` is the pool.
//
// The cost of "ambient" is that a write made outside `transaction` quietly
// uses the pool instead. Only one transaction spans repositories —
// TransactionRunner (postgres-transaction-runner.ts) in
// OrderService.placeOrder — and the rollback test proves that path is atomic
// (plan.md Risk R2). The cart and order repositories also call
// `transaction` for their own multi-statement writes, which join that one
// when it is open.
export class DatabaseClient implements OnModuleInit, OnApplicationShutdown {
  private readonly transactions = new AsyncLocalStorage<Transaction<DatabaseSchema>>();

  constructor(private readonly db: Database) {}

  executor(): DatabaseExecutor {
    return this.transactions.getStore() ?? this.db;
  }

  // A nested call joins the transaction already open in this async context
  // rather than opening a second one — there are no savepoints, because
  // nothing needs a partial rollback.
  //
  // Errors: whatever `work` throws is rethrown unchanged — domain errors,
  // and driver errors the repositories have already mapped. Everything else
  // comes from the transaction machinery itself: acquiring a connection,
  // BEGIN, COMMIT, or ROLLBACK. Those are raw driver errors, so they are
  // mapped here, the same way a repository maps its own
  // (persistence.errors.ts). Kysely also rethrows a failed ROLLBACK *in
  // place of* `work`'s error, so `work`'s error is kept and preferred: the
  // caller learns why the work failed, not that cleanup also failed.
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactions.getStore() !== undefined) {
      return work();
    }
    let workFailure: { readonly error: unknown } | undefined;
    try {
      return await this.db.transaction().execute((trx) =>
        this.transactions.run(trx, async () => {
          try {
            return await work();
          } catch (error) {
            workFailure = { error };
            throw error;
          }
        }),
      );
    } catch (error) {
      if (workFailure !== undefined) {
        throw workFailure.error;
      }
      throw toPersistenceError(error, "transaction");
    }
  }

  // Fail fast at boot (plan.md OD8): a database that cannot be reached
  // stops the process before it listens, instead of every request failing.
  // The error names the code only — never the URL, host, or driver text —
  // and carries no `cause`, because Node prints a cause chain on exit.
  async onModuleInit(): Promise<void> {
    try {
      await sql`select 1`.execute(this.db);
    } catch (error) {
      const { code } = describeDriverError(error);
      throw new Error(`Database unreachable at startup (code ${code ?? "unknown"}).`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
