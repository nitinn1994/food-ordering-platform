import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  resetDatabase,
} from "../../../../test/support/test-database";
import { testConfig } from "../../../config/test-config";
import { DatabaseClient, createDatabase } from "../../../database/database-client";
import type { DatabaseSchema } from "../../../database/database.schema";
import { DatabaseUnavailableError } from "../../../database/persistence.errors";
import { CartVersionConflictError } from "../domain/cart.errors";
import { CartInvariantViolationError } from "../domain/cart.invariants";
import {
  addLine,
  clearLines,
  emptyCart,
  removeLine,
  setLineQuantity,
} from "../domain/cart.operations";
import type { Cart } from "../domain/cart.types";
import { PostgresCartRepository } from "./postgres-cart.repository";

// PostgresCartRepository against the real database — AC5
// (docs/features/phase-10-database-persistence/requirements.md; plan.md
// §7, §19). The first block repeats in-memory-cart.repository.test.ts's
// contract cases one for one, so the two adapters are held to the same
// CartRepository contract; the rest is what only a real database can show.

const T0 = new Date("2026-09-25T10:00:00.123Z");
const T1 = new Date("2026-09-25T10:05:00.456Z");
const T2 = new Date("2026-09-25T10:10:00.789Z");

function firstCart(ownerId = "owner-a"): Cart {
  return addLine(emptyCart(ownerId, T0), "tiramisu", 2, T0); // version 1
}

describe("PostgresCartRepository", () => {
  let db: Kysely<DatabaseSchema>;
  let client: DatabaseClient;
  let repository: PostgresCartRepository;
  // Independent connections, for reading what is committed and for holding
  // a lock from "another request".
  let other: Kysely<DatabaseSchema>;

  beforeAll(() => {
    db = createTestDatabase();
    other = createTestDatabase();
    client = new DatabaseClient(db);
    repository = new PostgresCartRepository(client);
  });

  afterAll(async () => {
    await client.onApplicationShutdown();
    await other.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  describe("the CartRepository contract (same cases as the in-memory adapter)", () => {
    it("returns undefined for an owner with no saved cart", async () => {
      await expect(repository.findByOwner("owner-a")).resolves.toBeUndefined();
    });

    it("round-trips a saved cart, timestamps included", async () => {
      const cart = firstCart();
      await repository.save(cart);
      await expect(repository.findByOwner("owner-a")).resolves.toEqual(cart);
    });

    it("keeps owners' carts separate", async () => {
      await repository.save(firstCart("owner-a"));
      await expect(repository.findByOwner("owner-b")).resolves.toBeUndefined();
    });

    it("rejects a first save whose version is not 1, storing nothing", async () => {
      await expect(repository.save({ ...firstCart(), version: 2 })).rejects.toBeInstanceOf(
        CartVersionConflictError,
      );
      await expect(repository.findByOwner("owner-a")).resolves.toBeUndefined();
    });

    it("accepts a save exactly one version ahead of the stored one", async () => {
      const v1 = firstCart();
      await repository.save(v1);
      await repository.save(addLine(v1, "tiramisu", 1, T1));
      expect((await repository.findByOwner("owner-a"))?.version).toBe(2);
    });

    it("rejects the second of two writes based on the same read (lost update)", async () => {
      await repository.save(firstCart());
      const readByA = (await repository.findByOwner("owner-a"))!;
      const readByB = (await repository.findByOwner("owner-a"))!;

      await repository.save(addLine(readByA, "tiramisu", 1, T1));
      await expect(
        repository.save(addLine(readByB, "garlic-bread", 1, T1)),
      ).rejects.toBeInstanceOf(CartVersionConflictError);

      const stored = await repository.findByOwner("owner-a");
      expect(stored?.lines).toEqual([{ itemId: "tiramisu", quantity: 3 }]);
      expect(stored?.version).toBe(2);
    });

    it("maps a conflict to 409 CART_CONFLICT", async () => {
      await expect(repository.save({ ...firstCart(), version: 5 })).rejects.toMatchObject({
        status: 409,
        code: "CART_CONFLICT",
      });
    });

    it("rejects a cart that breaks an invariant, before touching the database", async () => {
      const broken: Cart = {
        ...firstCart(),
        lines: [
          { itemId: "tiramisu", quantity: 1 },
          { itemId: "tiramisu", quantity: 1 },
        ],
      };
      await expect(repository.save(broken)).rejects.toBeInstanceOf(CartInvariantViolationError);
      expect(await other.selectFrom("carts").selectAll().execute()).toEqual([]);
    });

    it("returns a frozen cart; mutating it throws", async () => {
      await repository.save(firstCart());
      const cart = (await repository.findByOwner("owner-a"))!;
      expect(() => {
        (cart.lines as { itemId: string; quantity: number }[]).push({
          itemId: "garlic-bread",
          quantity: 1,
        });
      }).toThrow(TypeError);
      expect(() => {
        (cart.lines[0] as { quantity: number }).quantity = 50;
      }).toThrow(TypeError);
    });

    it("is unaffected by later mutation of the object passed to save()", async () => {
      const cart = { ...firstCart(), lines: [{ itemId: "tiramisu", quantity: 2 }] };
      await repository.save(cart);
      cart.lines[0]!.quantity = 50;
      expect((await repository.findByOwner("owner-a"))?.lines[0]?.quantity).toBe(2);
    });
  });

  describe("storage", () => {
    it("keeps first-add line order through merges, quantity changes and removals", async () => {
      let cart = firstCart(); // tiramisu
      await repository.save(cart);
      for (const next of [
        (c: Cart) => addLine(c, "garlic-bread", 1, T1),
        (c: Cart) => addLine(c, "veggie-burger", 3, T1),
        (c: Cart) => addLine(c, "tiramisu", 1, T1), // merge in place
        (c: Cart) => setLineQuantity(c, "garlic-bread", 5, T1),
        (c: Cart) => removeLine(c, "tiramisu", T2),
        (c: Cart) => addLine(c, "tiramisu", 1, T2), // re-added: now last
      ]) {
        cart = next(cart);
        await repository.save(cart);
        expect(await repository.findByOwner("owner-a")).toEqual(cart);
      }
      expect(cart.lines.map((line) => line.itemId)).toEqual([
        "garlic-bread",
        "veggie-burger",
        "tiramisu",
      ]);
    });

    it("keeps createdAt and moves updatedAt on later saves", async () => {
      const v1 = firstCart();
      await repository.save(v1);
      await repository.save(addLine(v1, "garlic-bread", 1, T2));
      const stored = await repository.findByOwner("owner-a");
      expect(stored?.createdAt).toEqual(T0);
      expect(stored?.updatedAt).toEqual(T2);
    });

    it("clearing keeps the cart row and bumps its version (plan.md §7)", async () => {
      const v1 = firstCart();
      await repository.save(v1);
      const cleared = clearLines(v1, T1);
      await repository.save(cleared);

      await expect(repository.findByOwner("owner-a")).resolves.toEqual(cleared);
      expect(await other.selectFrom("cart_lines").selectAll().execute()).toEqual([]);
      expect(
        await other.selectFrom("carts").select(["owner_id", "version"]).execute(),
      ).toEqual([{ owner_id: "owner-a", version: 2 }]);
      // A stale first write can never succeed once the row exists.
      await expect(repository.save(firstCart())).rejects.toBeInstanceOf(
        CartVersionConflictError,
      );
    });

    it("stores a line for an item that is no longer on the menu (no FK — plan.md OD6)", async () => {
      await repository.save(addLine(emptyCart("owner-a", T0), "not-on-the-menu", 1, T0));
      expect((await repository.findByOwner("owner-a"))?.lines).toEqual([
        { itemId: "not-on-the-menu", quantity: 1 },
      ]);
    });

    it("leaves the stored cart untouched when a conflicting save is rejected", async () => {
      const v1 = firstCart();
      await repository.save(v1);
      await repository.save(addLine(v1, "garlic-bread", 1, T1)); // v2
      await expect(
        repository.save(addLine(v1, "veggie-burger", 9, T2)), // also v2
      ).rejects.toBeInstanceOf(CartVersionConflictError);
      expect(
        await other.selectFrom("cart_lines").select("item_id").orderBy("position").execute(),
      ).toEqual([{ item_id: "tiramisu" }, { item_id: "garlic-bread" }]);
    });

    it("maps an unreachable database to DatabaseUnavailableError (503)", async () => {
      const unreachable = new DatabaseClient(
        createDatabase(testConfig({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x_test" })),
      );
      const offline = new PostgresCartRepository(unreachable);
      try {
        await expect(offline.findByOwner("owner-a")).rejects.toBeInstanceOf(
          DatabaseUnavailableError,
        );
        await expect(offline.save(firstCart())).rejects.toBeInstanceOf(DatabaseUnavailableError);
      } finally {
        await unreachable.onApplicationShutdown();
      }
    });
  });

  describe("concurrency on a real database (AC5)", () => {
    it("of two concurrent saves at the same version, exactly one succeeds", async () => {
      const v1 = firstCart();
      await repository.save(v1);
      const a = addLine(v1, "garlic-bread", 1, T1);
      const b = addLine(v1, "veggie-burger", 1, T1);

      const results = await Promise.allSettled([repository.save(a), repository.save(b)]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        CartVersionConflictError,
      );
      const winner = results[0]!.status === "fulfilled" ? a : b;
      await expect(repository.findByOwner("owner-a")).resolves.toEqual(winner);
    });

    it("of two concurrent first saves for one owner, exactly one succeeds", async () => {
      const a = firstCart();
      const b = addLine(emptyCart("owner-a", T0), "garlic-bread", 1, T0);

      const results = await Promise.allSettled([repository.save(a), repository.save(b)]);

      expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
      const winner = results[0]!.status === "fulfilled" ? a : b;
      await expect(repository.findByOwner("owner-a")).resolves.toEqual(winner);
    });

    it("of many concurrent saves at the same version, exactly one succeeds", async () => {
      const v1 = firstCart();
      await repository.save(v1);
      const attempts = Array.from({ length: 8 }, (_, i) =>
        setLineQuantity(v1, "tiramisu", i + 1, T1),
      );
      const results = await Promise.allSettled(attempts.map((cart) => repository.save(cart)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await repository.findByOwner("owner-a"))?.version).toBe(2);
    });

    // Deterministic, not timing-dependent: another connection has already
    // moved the cart to version 2 inside an open transaction, holding the
    // row lock. This save (also version 2) must wait for that lock rather
    // than read past it — asserted from pg_stat_activity — and, once the
    // other transaction commits, re-check the version and fail.
    it("waits for a concurrent writer's lock, then fails its version check", async () => {
      const v1 = firstCart();
      await repository.save(v1);

      let releaseHolder!: () => void;
      const holderMayCommit = new Promise<void>((resolve) => (releaseHolder = resolve));
      let holderUpdated!: () => void;
      const holderHasLock = new Promise<void>((resolve) => (holderUpdated = resolve));

      const holder = other.transaction().execute(async (trx) => {
        await trx
          .updateTable("carts")
          .set({ version: 2, updated_at: T1 })
          .where("owner_id", "=", "owner-a")
          .execute();
        holderUpdated();
        await holderMayCommit;
      });
      await holderHasLock;

      const pending = repository.save(addLine(v1, "garlic-bread", 1, T2));
      const outcome = pending.then(
        () => "saved",
        (error: unknown) => error,
      );

      await waitForLockWait(other);
      releaseHolder();
      await holder;

      expect(await outcome).toBeInstanceOf(CartVersionConflictError);
      // The holder's version stands; the waiting save wrote no lines.
      const stored = await repository.findByOwner("owner-a");
      expect(stored?.version).toBe(2);
      expect(stored?.lines).toEqual([{ itemId: "tiramisu", quantity: 2 }]);
    });
  });
});

// Resolves once some session in this database is waiting on a lock; fails
// after ~5 s. Polls the catalog rather than sleeping a fixed time.
async function waitForLockWait(observer: Kysely<DatabaseSchema>): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const { rows } = await sql<{ pid: number }>`
      select pid from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`.execute(observer);
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("expected a session to be waiting on a lock");
}

