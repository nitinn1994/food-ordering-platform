import { Injectable } from "@nestjs/common";
import { deepFreeze } from "../../../common/immutability/deep-freeze";
import { DatabaseClient } from "../../../database/database-client";
import { toPersistenceError } from "../../../database/persistence.errors";
import { CartVersionConflictError } from "../domain/cart.errors";
import { assertCartInvariants } from "../domain/cart.invariants";
import { CartRepository } from "../domain/cart.repository";
import type { Cart, CartLine, CartOwnerId } from "../domain/cart.types";

// The runtime CartRepository: one `carts` row per owner plus its
// `cart_lines`, line order stored as `position`
// (docs/features/phase-10-database-persistence/plan.md §7, OD14).
//
// save() implements the port's optimistic version check exactly as the
// port describes it (cart.repository.ts, ADR-0015 §4):
//
//   - version 1  → INSERT … ON CONFLICT (owner_id) DO NOTHING; no row
//     inserted means a cart already exists → CartVersionConflictError;
//   - version N  → UPDATE … WHERE version = N - 1; no row updated means the
//     stored version moved on → CartVersionConflictError;
//
// then replaces the lines. All of it is one transaction — joining the
// caller's, when there is one (order placement), else its own. Under READ
// COMMITTED the guarded UPDATE takes the row lock, so of two concurrent
// saves at the same version the second waits, re-checks `version`, matches
// no row and fails: no explicit locking, no SERIALIZABLE.
//
// A cleared cart keeps its `carts` row (lines: [], version + 1), so an
// owner's version only ever rises and a stale version-1 write can never
// succeed again.
@Injectable()
export class PostgresCartRepository extends CartRepository {
  constructor(private readonly databaseClient: DatabaseClient) {
    super();
  }

  // One statement, so the cart and its lines always come from the same
  // snapshot — two queries could see one version's header with the next
  // version's lines.
  async findByOwner(ownerId: CartOwnerId): Promise<Cart | undefined> {
    let rows;
    try {
      rows = await this.databaseClient
        .executor()
        .selectFrom("carts")
        .leftJoin("cart_lines", "cart_lines.owner_id", "carts.owner_id")
        .select([
          "carts.owner_id",
          "carts.version",
          "carts.created_at",
          "carts.updated_at",
          "cart_lines.item_id",
          "cart_lines.quantity",
        ])
        .where("carts.owner_id", "=", ownerId)
        .orderBy("cart_lines.position")
        .execute();
    } catch (error) {
      throw toPersistenceError(error, "cart.findByOwner");
    }

    const [header] = rows;
    if (header === undefined) {
      return undefined;
    }
    const lines: CartLine[] = [];
    for (const row of rows) {
      if (row.item_id !== null && row.quantity !== null) {
        lines.push({ itemId: row.item_id, quantity: row.quantity });
      }
    }
    return deepFreeze({
      ownerId: header.owner_id,
      lines,
      version: header.version,
      createdAt: header.created_at,
      updatedAt: header.updated_at,
    });
  }

  async save(cart: Cart): Promise<void> {
    assertCartInvariants(cart);

    try {
      await this.databaseClient.transaction(async () => {
        const db = this.databaseClient.executor();

        if (cart.version === 1) {
          const inserted = await db
            .insertInto("carts")
            .values({
              owner_id: cart.ownerId,
              version: cart.version,
              created_at: cart.createdAt,
              updated_at: cart.updatedAt,
            })
            .onConflict((conflict) => conflict.column("owner_id").doNothing())
            .returning("owner_id")
            .executeTakeFirst();
          if (inserted === undefined) {
            throw new CartVersionConflictError();
          }
        } else {
          const updated = await db
            .updateTable("carts")
            .set({ version: cart.version, updated_at: cart.updatedAt })
            .where("owner_id", "=", cart.ownerId)
            .where("version", "=", cart.version - 1)
            .executeTakeFirst();
          if (updated.numUpdatedRows === 0n) {
            throw new CartVersionConflictError();
          }
        }

        // Whole-aggregate replace: a cart has at most one line per menu
        // item, so this is bounded, and it keeps line-level rules out of SQL
        // (cart.repository.ts).
        await db.deleteFrom("cart_lines").where("owner_id", "=", cart.ownerId).execute();
        if (cart.lines.length > 0) {
          await db
            .insertInto("cart_lines")
            .values(
              cart.lines.map((line, position) => ({
                owner_id: cart.ownerId,
                item_id: line.itemId,
                position,
                quantity: line.quantity,
              })),
            )
            .execute();
        }
      });
    } catch (error) {
      if (error instanceof CartVersionConflictError) {
        throw error;
      }
      throw toPersistenceError(error, "cart.save");
    }
  }
}
