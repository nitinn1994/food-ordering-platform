import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { OrderIdGenerator } from "../domain/order-id.generator";
import type { OrderId } from "../domain/order.types";

// The Phase 9 OrderIdGenerator: a random (v4) UUID from Node's own crypto —
// already how request-context.middleware.ts mints request ids, so no new
// dependency. Always lowercase, which is what @contracts/api-contracts'
// orderIdSchema requires (docs/features/phase-9-order-domain/plan.md OD13).
@Injectable()
export class UuidOrderIdGenerator extends OrderIdGenerator {
  next(): OrderId {
    return randomUUID();
  }
}
