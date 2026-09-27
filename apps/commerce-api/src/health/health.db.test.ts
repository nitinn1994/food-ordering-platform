import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { testDatabaseConfig } from "../../test/support/test-database";
import { DatabaseModule } from "../database/database.module";
import { HealthModule } from "./health.module";
import { HealthService } from "./health.service";

// Readiness against the real database (Phase 18, requirements.md AC6); the
// DB-free "not ready" side is test/security-headers.e2e.test.ts.
describe("readiness on PostgreSQL", () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("is ready when the database answers", async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot(testDatabaseConfig()), HealthModule],
    }).compile();
    await moduleRef.init();

    await expect(moduleRef.get(HealthService).ready()).resolves.toEqual({ status: "ready" });
  });
});
