import { Controller, Get, Res, VERSION_NEUTRAL } from "@nestjs/common";
import type { Response } from "express";
import {
  HealthService,
  type HealthStatus,
  type ReadinessStatus,
} from "./health.service";

const HTTP_SERVICE_UNAVAILABLE = 503;

// Unversioned: VERSION_NEUTRAL opts this controller out of the global URI
// versioning configure-app.ts enables for every other route
// (requirements.md AC10) — a probe has no contract to version.
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.healthService.check();
  }

  // 200 when ready, 503 when not — the status code is what a probe reads.
  @Get("ready")
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessStatus> {
    const readiness = await this.healthService.ready();
    if (readiness.status !== "ready") {
      response.status(HTTP_SERVICE_UNAVAILABLE);
    }
    return readiness;
  }
}
