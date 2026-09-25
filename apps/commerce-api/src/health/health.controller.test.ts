import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";
import { HealthModule } from "./health.module";
import { HealthService } from "./health.service";

// Constructor injection by class type, no @Inject() — the same toolchain
// proof AC3 originally rested on the temporary AppController/AppService
// scaffold (sub-phase 6.1); HealthModule is what replaces that scaffold, so
// this is where the proof now lives permanently.
describe("HealthController", () => {
  it("resolves HealthService via constructor injection with no @Inject", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const service = moduleRef.get(HealthService);

    expect(controller).toBeInstanceOf(HealthController);
    expect(service).toBeInstanceOf(HealthService);
    expect(controller.check()).toEqual({ status: "ok" });
  });
});
