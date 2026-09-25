import { Injectable } from "@nestjs/common";

export interface HealthStatus {
  status: "ok";
}

// Liveness only, deliberately: no dependency check, no version, no uptime
// (plan.md, Phase 6, §12). There is nothing to be ready for yet — no
// database, no downstream call — so there is no separate readiness check
// either.
@Injectable()
export class HealthService {
  check(): HealthStatus {
    return { status: "ok" };
  }
}
