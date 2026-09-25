import { Injectable } from "@nestjs/common";
import type { IdempotencyKey } from "@contracts/common";
import { deepFreeze } from "../../../common/immutability/deep-freeze";
import { DatabaseClient } from "../../../database/database-client";
import {
  isUniqueViolation,
  toPersistenceError,
} from "../../../database/persistence.errors";
import { OrderAlreadyExistsError } from "../domain/order.errors";
import { assertOrderInvariants } from "../domain/order.invariants";
import { OrderRepository } from "../domain/order.repository";
import type {
  CustomerDetails,
  Order,
  OrderId,
  OrderLine,
  OrderOwnerId,
} from "../domain/order.types";

// The two constraints OrderRepository.create's contract names
// (order.repository.ts): a duplicate id, or a duplicate (owner, key).
const ORDER_ID_CONSTRAINT = "orders_pkey";
const OWNER_IDEMPOTENCY_KEY_CONSTRAINT = "orders_owner_idempotency_key_key";

// `orders.id` is a uuid column, and Postgres returns it lowercase. An id
// that is not a lowercase UUID can match no stored order — answering
// `undefined` without querying keeps the port's contract identical to the
// in-memory adapter's (which simply finds nothing), instead of turning a
// malformed id into a database "invalid input syntax" error. HTTP already
// rejects such ids (orderIdSchema); this guards direct callers.
const STORED_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The runtime OrderRepository: one `orders` row plus its `order_lines`,
// line order stored as `position`
// (docs/features/phase-10-database-persistence/plan.md §8). Insert-only,
// owner-scoped reads — the port's contract, unchanged.
//
// Every value on an order is a copy made at placement; order_lines.item_id
// has no foreign key to the menu, so no later menu change can reach a
// stored order (ADR-0016 §1; plan.md OD6).
//
// Customer details are personal data: they are written and read here, and
// never put into an error — a driver error is reduced to its code and
// constraint name before anything sees it (persistence.errors.ts).
@Injectable()
export class PostgresOrderRepository extends OrderRepository {
  constructor(private readonly databaseClient: DatabaseClient) {
    super();
  }

  // One transaction for the order and its lines — joining the caller's when
  // there is one (OrderService.placeOrder, which also consumes the cart in
  // it), else its own.
  async create(order: Order): Promise<void> {
    assertOrderInvariants(order);

    try {
      await this.databaseClient.transaction(async () => {
        const db = this.databaseClient.executor();
        await db
          .insertInto("orders")
          .values({
            id: order.id,
            owner_id: order.ownerId,
            idempotency_key: order.idempotencyKey,
            status: order.status,
            item_count: order.itemCount,
            subtotal_cents: order.subtotalCents,
            total_cents: order.totalCents,
            customer_full_name: order.customer.fullName,
            customer_phone: order.customer.phone,
            customer_email: order.customer.email ?? null,
            created_at: order.createdAt,
            updated_at: order.updatedAt,
          })
          .execute();
        await db
          .insertInto("order_lines")
          .values(
            order.lines.map((line, position) => ({
              order_id: order.id,
              position,
              item_id: line.itemId,
              name: line.name,
              unit_price_cents: line.unitPriceCents,
              quantity: line.quantity,
              line_subtotal_cents: line.lineSubtotalCents,
            })),
          )
          .execute();
      });
    } catch (error) {
      if (
        isUniqueViolation(error, ORDER_ID_CONSTRAINT) ||
        isUniqueViolation(error, OWNER_IDEMPOTENCY_KEY_CONSTRAINT)
      ) {
        throw new OrderAlreadyExistsError();
      }
      throw toPersistenceError(error, "order.create");
    }
  }

  async findById(
    ownerId: OrderOwnerId,
    orderId: OrderId,
  ): Promise<Order | undefined> {
    if (!STORED_ORDER_ID.test(orderId)) {
      return undefined;
    }
    return this.findOne("order.findById", ownerId, "id", orderId);
  }

  async findByIdempotencyKey(
    ownerId: OrderOwnerId,
    idempotencyKey: IdempotencyKey,
  ): Promise<Order | undefined> {
    return this.findOne(
      "order.findByIdempotencyKey",
      ownerId,
      "idempotency_key",
      idempotencyKey,
    );
  }

  // One statement, so an order and its lines come from one snapshot. Always
  // scoped by owner: another owner's order is indistinguishable from none.
  //
  // INNER JOIN on purpose: every order has at least one line (the
  // item_count >= 1 check and assertOrderInvariants), and create() writes
  // the order and its lines in one transaction, so no line-less order can
  // exist. If one ever did — a manual fix, a future migration — it would
  // read as "no such order" here; keep that invariant when touching either.
  private async findOne(
    operation: string,
    ownerId: OrderOwnerId,
    column: "id" | "idempotency_key",
    value: string,
  ): Promise<Order | undefined> {
    let rows;
    try {
      rows = await this.databaseClient
        .executor()
        .selectFrom("orders")
        .innerJoin("order_lines", "order_lines.order_id", "orders.id")
        .select([
          "orders.id",
          "orders.owner_id",
          "orders.idempotency_key",
          "orders.status",
          "orders.item_count",
          "orders.subtotal_cents",
          "orders.total_cents",
          "orders.customer_full_name",
          "orders.customer_phone",
          "orders.customer_email",
          "orders.created_at",
          "orders.updated_at",
          "order_lines.item_id",
          "order_lines.name",
          "order_lines.unit_price_cents",
          "order_lines.quantity",
          "order_lines.line_subtotal_cents",
        ])
        .where("orders.owner_id", "=", ownerId)
        .where(`orders.${column}`, "=", value)
        .orderBy("order_lines.position")
        .execute();
    } catch (error) {
      throw toPersistenceError(error, operation);
    }

    const [header] = rows;
    if (header === undefined) {
      return undefined;
    }
    const lines: OrderLine[] = rows.map((row) => ({
      itemId: row.item_id,
      name: row.name,
      unitPriceCents: row.unit_price_cents,
      quantity: row.quantity,
      lineSubtotalCents: row.line_subtotal_cents,
    }));
    // NULL ⇔ absent: the key is left out, never set to undefined or "" —
    // the same shape order.create.ts's copyCustomer produces.
    const customer: CustomerDetails =
      header.customer_email === null
        ? { fullName: header.customer_full_name, phone: header.customer_phone }
        : {
            fullName: header.customer_full_name,
            phone: header.customer_phone,
            email: header.customer_email,
          };
    return deepFreeze({
      id: header.id,
      ownerId: header.owner_id,
      idempotencyKey: header.idempotency_key,
      lines,
      itemCount: header.item_count,
      subtotalCents: header.subtotal_cents,
      totalCents: header.total_cents,
      status: header.status,
      customer,
      createdAt: header.created_at,
      updatedAt: header.updated_at,
    });
  }
}
