import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { HealthService, type HealthStatus } from "./health.service";

// Unversioned: VERSION_NEUTRAL opts this controller out of the global URI
// versioning configure-app.ts enables for every other route
// (requirements.md AC10) — a liveness check has no contract to version.
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.healthService.check();
  }
}
