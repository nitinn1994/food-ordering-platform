import { Injectable } from "@nestjs/common";
import { DatabaseClient } from "../database/database-client";

export interface HealthStatus {
  status: "ok";
}

export interface ReadinessStatus {
  status: "ready" | "not_ready";
}

// How long readiness waits for the database before answering "not ready"
// (Phase 18, plan.md AC6) — well inside any load balancer's probe timeout.
export const READINESS_DB_TIMEOUT_MS = 1_000;

// Two probes, kept apart deliberately (Phase 18, plan.md §10):
//
// - check(): liveness. No dependency, no version, no uptime (Phase 6,
//   §12). A database outage must not get a healthy process restarted.
// - ready(): readiness. The one dependency without which no business route
//   can succeed — PostgreSQL — answers `select 1` in time. Nothing about
//   the failure is returned: the body is only the status.
@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseClient) {}

  check(): HealthStatus {
    return { status: "ok" };
  }

  async ready(): Promise<ReadinessStatus> {
    const reachable = await this.database.ping(READINESS_DB_TIMEOUT_MS);
    return { status: reachable ? "ready" : "not_ready" };
  }
}
