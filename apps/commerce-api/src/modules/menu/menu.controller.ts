import { Controller, Get, Param } from "@nestjs/common";
import {
  menuItemParamsSchema,
  type MenuItemParams,
  type MenuItemResponse,
  type MenuResponse,
} from "@contracts/api-contracts";
import { MenuService } from "./menu.service";

// No explicit version option: URI versioning's defaultVersion ("1", set
// once in configure-app.ts) applies to every controller that doesn't opt
// out — health.controller.ts's VERSION_NEUTRAL is the one exception, not
// this one (docs/api/commerce-api.md §2). Routes here are therefore served
// under /v1/menu/... automatically.
//
// This controller does no branching, lookup, or error decision of its own
// (requirements.md AC5) — it only routes and calls MenuService.
@Controller("menu")
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  async getMenu(): Promise<MenuResponse> {
    return this.menuService.getMenu();
  }

  // The route param is validated against menuItemParamsSchema through the
  // same global StandardSchemaValidationPipe request bodies already use
  // (@Body({ schema }) elsewhere) — Nest 12's @Param(options) accepts a
  // Standard Schema the identical way. A malformed itemId is rejected
  // before this method runs, with field: "itemId" (docs/api/commerce-api.md
  // §4, §6).
  @Get("items/:itemId")
  async getItem(
    @Param({ schema: menuItemParamsSchema }) params: MenuItemParams,
  ): Promise<MenuItemResponse> {
    return this.menuService.getItem(params.itemId);
  }
}
