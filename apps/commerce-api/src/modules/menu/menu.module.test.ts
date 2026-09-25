import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { MenuRepository } from "./domain/menu.repository";
import { testConfig } from "../../config/test-config";
import { DatabaseModule } from "../../database/database.module";
import { withInMemoryPersistence } from "../../../test/support/in-memory-persistence";
import { PostgresMenuRepository } from "./infrastructure/postgres-menu.repository";
import { MenuController } from "./menu.controller";
import { MenuModule } from "./menu.module";
import { MenuService } from "./menu.service";

// Constructor injection by class type, no @Inject() — the same toolchain
// proof health.controller.test.ts gives HealthModule, here for MenuModule's
// abstract-class DI token (requirements.md AC5).
describe("MenuModule", () => {
  // Phase 10: the runtime binding is Postgres. Compiling does not connect
  // (pg.Pool is lazy), so this needs no database.
  it("resolves MenuController → MenuService → MenuRepository by class type", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot(testConfig()), MenuModule],
    }).compile();

    const controller = moduleRef.get(MenuController);
    const service = moduleRef.get(MenuService);
    const repository = moduleRef.get(MenuRepository);

    expect(controller).toBeInstanceOf(MenuController);
    expect(service).toBeInstanceOf(MenuService);
    expect(repository).toBeInstanceOf(PostgresMenuRepository);
  });

  it("resolves GET /menu through the compiled module end to end", async () => {
    const moduleRef = await withInMemoryPersistence(
      Test.createTestingModule({
        imports: [MenuModule],
      }),
    ).compile();

    const controller = moduleRef.get(MenuController);
    const result = await controller.getMenu();

    expect(result.categories).toHaveLength(3);
  });
});
