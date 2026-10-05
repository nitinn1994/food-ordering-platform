import type { ReactNode } from "react";
import type { MenuCategory } from "@contracts/api-contracts";
import { CategoryFilter } from "./CategoryFilter";
import { MenuList } from "./MenuList";
import { ItemDetailPanel } from "./ItemDetailPanel";
import { CartPanel } from "../cart/CartPanel";
import { ChatInput } from "../chat/ChatInput";
import { CommandLogPanel } from "../dev/CommandLogPanel";
import { MenuBand } from "../home/MenuBand";
import { CartNudge } from "../nudges/CartNudge";
import { ItemDetailNudge } from "../nudges/ItemDetailNudge";
import { NudgeToast } from "../nudges/NudgeToast";
import { MENU_SECTION_ID } from "../../lib/menu/scrollToMenu";
import styles from "./MenuLayout.module.css";

// The menu itself, shared by the home page and /menu/[categoryId]
// (docs/features/mcdelivery-parity/plan.md, Phase 3): the "Our Menu" band,
// then three columns — category rail, menu grid (with the chat below it),
// and a sticky column holding the cart. Below 1200px it is the two-pane
// mobile menu (Phase 2). DOM order is reading order at every width; only
// the styling changes. `beforeBand` and `afterBand` are the home page's
// mobile shortcuts (Quick Picks, category tiles).
export function MenuLayout({
  categories,
  beforeBand,
  afterBand,
}: {
  categories: readonly MenuCategory[];
  beforeBand?: ReactNode;
  afterBand?: ReactNode;
}) {
  return (
    <>
      <div className={styles.container}>
        {beforeBand}
        <MenuBand categories={categories} />
        {afterBand}
        <div className={styles.layout}>
          <div className={styles.rail}>
            <CategoryFilter categories={categories} />
          </div>
          <section id={MENU_SECTION_ID} className={styles.content} aria-label="Menu items">
            <MenuList categories={categories} />
            <ChatInput />
          </section>
          <div className={styles.side}>
            <CartPanel />
            <CartNudge />
            <CommandLogPanel />
          </div>
        </div>
      </div>
      {/* A modal dialog (Phase 3, AC7): its place in the DOM does not
          matter, it opens in the top layer. */}
      <ItemDetailPanel categories={categories}>
        <ItemDetailNudge />
      </ItemDetailPanel>
      <NudgeToast />
    </>
  );
}
