import { Injectable } from "@nestjs/common";
import type { MenuItemId } from "@contracts/common";
import type { MenuItemResponse, MenuResponse } from "@contracts/api-contracts";
import { MenuItemNotFoundError } from "./domain/menu.errors";
import { MenuRepository } from "./domain/menu.repository";
import { toMenuItemResponse, toMenuResponse } from "./menu.mapper";

// The Menu domain's use cases. Depends only on the abstract MenuRepository
// — never on InMemoryMenuRepository or the seed directly (requirements.md
// AC5) — so a later database-backed repository is a binding change in
// MenuModule, not a change here.
@Injectable()
export class MenuService {
  constructor(private readonly menuRepository: MenuRepository) {}

  async getMenu(): Promise<MenuResponse> {
    const categories = await this.menuRepository.listCategories();
    return toMenuResponse(categories);
  }

  async getItem(itemId: MenuItemId): Promise<MenuItemResponse> {
    const item = await this.menuRepository.findItemById(itemId);
    if (!item) {
      throw new MenuItemNotFoundError();
    }
    return toMenuItemResponse(item);
  }
}
