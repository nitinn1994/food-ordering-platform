import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { MenuRepository } from "./domain/menu.repository";
import { InMemoryMenuRepository } from "./infrastructure/in-memory-menu.repository";
import { MenuController } from "./menu.controller";
import { MenuModule } from "./menu.module";
import { MenuService } from "./menu.service";

// Constructor injection by class type, no @Inject() — the same toolchain
// proof health.controller.test.ts gives HealthModule, here for MenuModule's
// abstract-class DI token (requirements.md AC5).
describe("MenuModule", () => {
  it("resolves MenuController → MenuService → MenuRepository by class type", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MenuModule],
    }).compile();

    const controller = moduleRef.get(MenuController);
    const service = moduleRef.get(MenuService);
    const repository = moduleRef.get(MenuRepository);

    expect(controller).toBeInstanceOf(MenuController);
    expect(service).toBeInstanceOf(MenuService);
    expect(repository).toBeInstanceOf(InMemoryMenuRepository);
  });

  it("resolves GET /menu through the compiled module end to end", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MenuModule],
    }).compile();

    const controller = moduleRef.get(MenuController);
    const result = await controller.getMenu();

    expect(result.categories).toHaveLength(3);
  });
});
