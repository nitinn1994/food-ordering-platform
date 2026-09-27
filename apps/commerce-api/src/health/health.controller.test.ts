import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { DatabaseClient } from "../database/database-client";
import { HealthController } from "./health.controller";
import { HealthModule } from "./health.module";
import { HealthService, READINESS_DB_TIMEOUT_MS } from "./health.service";

// DatabaseModule is @Global in the app; here the one method readiness uses
// is faked, so no database is needed.
async function compile(ping: (timeoutMs: number) => Promise<boolean>) {
  @Global()
  @Module({
    providers: [{ provide: DatabaseClient, useValue: { ping } }],
    exports: [DatabaseClient],
  })
  class FakeDatabaseModule {}

  return Test.createTestingModule({
    imports: [FakeDatabaseModule, HealthModule],
  }).compile();
}

function fakeResponse() {
  return { status: vi.fn() } as unknown as Response & { status: ReturnType<typeof vi.fn> };
}

// Constructor injection by class type, no @Inject() — the same toolchain
// proof AC3 originally rested on the temporary AppController/AppService
// scaffold (sub-phase 6.1); HealthModule is what replaces that scaffold, so
// this is where the proof now lives permanently.
describe("HealthController", () => {
  it("resolves HealthService via constructor injection with no @Inject", async () => {
    const moduleRef = await compile(async () => true);

    const controller = moduleRef.get(HealthController);
    const service = moduleRef.get(HealthService);

    expect(controller).toBeInstanceOf(HealthController);
    expect(service).toBeInstanceOf(HealthService);
    expect(controller.check()).toEqual({ status: "ok" });
  });

  describe("readiness (Phase 18 AC6)", () => {
    it("answers ready, with no status override, when the database responds", async () => {
      const ping = vi.fn(async () => true);
      const controller = (await compile(ping)).get(HealthController);
      const response = fakeResponse();

      expect(await controller.ready(response)).toEqual({ status: "ready" });
      expect(response.status).not.toHaveBeenCalled();
      expect(ping).toHaveBeenCalledWith(READINESS_DB_TIMEOUT_MS);
    });

    it("answers 503 not_ready when the database does not respond in time", async () => {
      const controller = (await compile(async () => false)).get(HealthController);
      const response = fakeResponse();

      expect(await controller.ready(response)).toEqual({ status: "not_ready" });
      expect(response.status).toHaveBeenCalledWith(503);
    });

    it("keeps liveness independent of the database", async () => {
      const ping = vi.fn(async () => false);
      const controller = (await compile(ping)).get(HealthController);

      expect(controller.check()).toEqual({ status: "ok" });
      expect(ping).not.toHaveBeenCalled();
    });
  });
});
