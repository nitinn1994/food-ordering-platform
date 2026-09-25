import { Module } from "@nestjs/common";
import { MenuRepository } from "./domain/menu.repository";
import { InMemoryMenuRepository } from "./infrastructure/in-memory-menu.repository";
import { MenuController } from "./menu.controller";
import { MenuService } from "./menu.service";

// The first domain module (ADR-0013 §8): controller → service → repository
// interface, with only infrastructure/ touching storage. MenuService is
// exported so a later module (e.g. Cart) can depend on it directly, without
// reaching into the Menu domain's repository or infrastructure
// (requirements.md AC5).
@Module({
  controllers: [MenuController],
  providers: [
    MenuService,
    { provide: MenuRepository, useClass: InMemoryMenuRepository },
  ],
  exports: [MenuService],
})
export class MenuModule {}
