import { Injectable } from "@nestjs/common";
import { TransactionRunner } from "../common/persistence/transaction-runner";
import { DatabaseClient } from "./database-client";

// The runtime TransactionRunner: one database-native transaction, joined by
// every repository call made inside `work` (database-client.ts;
// docs/features/phase-10-database-persistence/plan.md §12, OD4). If `work`
// throws, everything it wrote is rolled back and the error propagates
// unchanged. No retries, no distributed transaction.
@Injectable()
export class PostgresTransactionRunner extends TransactionRunner {
  constructor(private readonly databaseClient: DatabaseClient) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.databaseClient.transaction(work);
  }
}
