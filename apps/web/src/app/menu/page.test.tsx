import { describe, expect, it, vi } from "vitest";
import type { MenuCategory } from "@contracts/api-contracts";
import { MENU } from "../../test/fixtures/menu";

const menu = vi.hoisted(() => ({ categories: [] as readonly MenuCategory[] }));
vi.mock("../../lib/menu/menuSource", () => ({ getMenu: async () => menu.categories }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import MenuIndex from "./page";

// The mobile Menu tab's target (mcdelivery-parity Phase 2/3).
describe("/menu", () => {
  it("redirects to the first category's page", async () => {
    menu.categories = MENU;
    await expect(MenuIndex()).rejects.toThrow(`REDIRECT /menu/${MENU[0]!.id}`);
  });

  it("is a 404 when the menu has no categories", async () => {
    menu.categories = [];
    await expect(MenuIndex()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
