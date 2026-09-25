import { Injectable } from "@nestjs/common";
import { TransactionRunner } from "./transaction-runner";

// The test double for TransactionRunner, used with the in-memory
// repositories: it simply runs `work`. It gives no atomicity — exactly the
// behaviour the in-memory adapters have always had (ADR-0004's stated risk),
// which is why atomicity is proven against the real database instead
// (docs/features/phase-10-database-persistence/plan.md §12, AC7).
@Injectable()
export class InMemoryTransactionRunner extends TransactionRunner {
  async run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
