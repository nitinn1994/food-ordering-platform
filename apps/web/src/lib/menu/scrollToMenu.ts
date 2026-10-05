// The mobile home's category tiles select a category in place and then
// bring the menu into view, below the sticky toolbar
// (scroll-padding-top in globals.css). The id is set on the menu section in
// components/menu/MenuLayout.tsx.
export const MENU_SECTION_ID = "menu-items";

export function scrollToMenu(): void {
  document.getElementById(MENU_SECTION_ID)?.scrollIntoView({ block: "start" });
}
