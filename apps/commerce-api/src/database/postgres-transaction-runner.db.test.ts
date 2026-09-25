import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  resetDatabase,
} from "../../test/support/test-database";
import { DatabaseClient } from "./database-client";
import type { DatabaseSchema } from "./database.schema";
import { DatabaseUnavailableError } from "./persistence.errors";
import { PostgresTransactionRunner } from "./postgres-transaction-runner";

// The ambient-transaction mechanism order placement relies on
// (docs/features/phase-10-database-persistence/plan.md §12, OD4; AC7 at the
// unit level). Writes go through `client.executor()`, exactly as a
// repository's would.

const NOW = new Date("2026-09-25T12:00:00.000Z");

describe("PostgresTransactionRunner + DatabaseClient", () => {
  let db: Kysely<DatabaseSchema>;
  let client: DatabaseClient;
  let runner: PostgresTransactionRunner;
  // A second, independent connection pool — to observe what other
  // connections can see, i.e. what is actually committed.
  let observer: Kysely<DatabaseSchema>;

  beforeAll(() => {
    db = createTestDatabase();
    observer = createTestDatabase();
    client = new DatabaseClient(db);
    runner = new PostgresTransactionRunner(client);
  });

  afterAll(async () => {
    await client.onApplicationShutdown();
    await observer.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  function insertCart(ownerId: string) {
    return client
      .executor()
      .insertInto("carts")
      .values({ owner_id: ownerId, version: 1, created_at: NOW, updated_at: NOW })
      .execute();
  }

  async function committedOwners(): Promise<string[]> {
    const rows = await observer.selectFrom("carts").select("owner_id").orderBy("owner_id").execute();
    return rows.map((row) => row.owner_id);
  }

  it("uses the pool outside a transaction", () => {
    expect(client.executor().isTransaction).toBe(false);
  });

  it("hands repositories the open transaction inside run", async () => {
    await runner.run(async () => {
      expect(client.executor().isTransaction).toBe(true);
    });
    expect(client.executor().isTransaction).toBe(false);
  });

  it("commits every write inside run together, and returns work's result", async () => {
    const result = await runner.run(async () => {
      await insertCart("a");
      await insertCart("b");
      // Not yet visible to any other connection.
      expect(await committedOwners()).toEqual([]);
      return "done";
    });
    expect(result).toBe("done");
    expect(await committedOwners()).toEqual(["a", "b"]);
  });

  it("rolls back every write when work throws, and rethrows the same error", async () => {
    const failure = new Error("second write failed");
    await expect(
      runner.run(async () => {
        await insertCart("a");
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await committedOwners()).toEqual([]);
  });

  it("rolls back when a later write in the same transaction violates a constraint", async () => {
    await expect(
      runner.run(async () => {
        await insertCart("a");
        await insertCart("a"); // carts_pkey
      }),
    ).rejects.toMatchObject({ code: "23505", constraint: "carts_pkey" });
    expect(await committedOwners()).toEqual([]);
  });

  it("joins an outer transaction when nested, so an outer failure undoes the inner write", async () => {
    await expect(
      runner.run(async () => {
        const outer = client.executor();
        await runner.run(async () => {
          expect(client.executor()).toBe(outer);
          await insertCart("inner");
        });
        throw new Error("outer failed after inner returned");
      }),
    ).rejects.toThrow("outer failed");
    expect(await committedOwners()).toEqual([]);
  });

  // review-report.md #1 and #8: the database ends the session while a
  // transaction is open. Each of these tests uses its own pool, closed
  // afterwards: pg_terminate_backend returns before the killed socket has
  // closed, so a shared pool could otherwise hand that dead connection to
  // the next test in the millisecond before it notices.
  async function withOwnPool(
    test: (own: { client: DatabaseClient; runner: PostgresTransactionRunner }) => Promise<void>,
  ): Promise<void> {
    const own = new DatabaseClient(createTestDatabase());
    try {
      await test({ client: own, runner: new PostgresTransactionRunner(own) });
    } finally {
      await own.onApplicationShutdown();
    }
  }

  // Ends the session the open transaction runs on, from another connection —
  // what an administrator command or a database restart does.
  async function terminateOwnSession(own: DatabaseClient): Promise<void> {
    const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(
      own.executor(),
    );
    await sql`select pg_terminate_backend(${rows[0]!.pid})`.execute(observer);
  }

  function insertCartWith(own: DatabaseClient, ownerId: string) {
    return own
      .executor()
      .insertInto("carts")
      .values({ owner_id: ownerId, version: 1, created_at: NOW, updated_at: NOW })
      .execute();
  }

  // The transaction's own COMMIT fails because the session died between the
  // last write and COMMIT: the raw driver error must be mapped (503), nothing
  // may be committed, and the process must not see an uncaught 'error' from
  // the dead connection (Vitest fails the run on one).
  it("maps a COMMIT that fails because the connection died to DatabaseUnavailableError", async () => {
    await withOwnPool(async ({ client: own, runner: ownRunner }) => {
      const error: unknown = await ownRunner
        .run(async () => {
          await insertCartWith(own, "a");
          await terminateOwnSession(own);
        })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );
      expect(error).toBeInstanceOf(DatabaseUnavailableError);
      expect(await committedOwners()).toEqual([]);
    });
  });

  // When work fails and the ROLLBACK then fails too, Kysely rethrows the
  // rollback's error; the caller must still get work's own error.
  it("keeps work's own error when the rollback after it also fails", async () => {
    await withOwnPool(async ({ client: own, runner: ownRunner }) => {
      const failure = new Error("work failed after its session was ended");
      await expect(
        ownRunner.run(async () => {
          await insertCartWith(own, "a");
          await terminateOwnSession(own);
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await committedOwners()).toEqual([]);
    });
  });

  it("keeps concurrent transactions separate", async () => {
    await Promise.all([
      runner.run(async () => {
        await insertCart("a");
      }),
      runner
        .run(async () => {
          await insertCart("b");
          throw new Error("only this one fails");
        })
        .catch(() => undefined),
    ]);
    expect(await committedOwners()).toEqual(["a"]);
  });
});

describe("DatabaseClient lifecycle", () => {
  it("passes its boot check against a reachable database", async () => {
    const client = new DatabaseClient(createTestDatabase());
    await expect(client.onModuleInit()).resolves.toBeUndefined();
    await client.onApplicationShutdown();
  });
});
