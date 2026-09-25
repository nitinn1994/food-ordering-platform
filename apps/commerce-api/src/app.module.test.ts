import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module";
import { testConfig } from "./config/test-config";
import { HealthController } from "./health/health.controller";

// AppModule itself now holds no controllers or providers of its own — just
// the wiring that brings ConfigModule and HealthModule together
// (app.module.ts's own comment explains why cross-cutting HTTP middleware
// lives in configure-app.ts instead). This proves that wiring compiles;
// HealthController's own DI proof lives in health.controller.test.ts, and
// the full running-app behaviour (versioning, headers, errors) lives in
// test/app.e2e.test.ts and test/validation.e2e.test.ts.
describe("AppModule", () => {
  it("compiles, with HealthModule reachable through it", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(testConfig())],
    }).compile();

    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
  });
});
