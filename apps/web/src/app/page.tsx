import { CategoryFilter } from "../components/menu/CategoryFilter";
import { MenuList } from "../components/menu/MenuList";
import { ItemDetailPanel } from "../components/menu/ItemDetailPanel";
import { CartPanel } from "../components/cart/CartPanel";
import { ChatInput } from "../components/chat/ChatInput";
import { CommandLogPanel } from "../components/dev/CommandLogPanel";
import { HeroBanner } from "../components/home/HeroBanner";
import { MenuBand } from "../components/home/MenuBand";
import { CartNudge } from "../components/nudges/CartNudge";
import { ItemDetailNudge } from "../components/nudges/ItemDetailNudge";
import { NudgeToast } from "../components/nudges/NudgeToast";
import { getMenu } from "../lib/menu/menuSource";
import styles from "./page.module.css";

// Rendered per request, never prerendered: getMenu() reads commerce-api,
// which need not be running during `next build`, and whose menu must not be
// frozen into the build. `cache: "no-store"` alone did not opt this route
// out of prerendering (docs/features/phase-11-web-commerce-integration/
// plan.md, Assumption B — the plan's recorded fallback).
export const dynamic = "force-dynamic";

// Async Server Component: getMenu() is awaited here, once, and the result is
// passed down as a prop everywhere it's needed. loading.tsx and error.tsx
// (siblings in this directory) are Next.js's own Suspense/error-boundary
// wiring around this await — no explicit <Suspense> needed for a page-level
// async Server Component.
//
// UiProvider/CartProvider now live in app/layout.tsx, not here — see
// docs/features/phase-3-frontend-cart-simulation/plan.md — so cart state
// survives navigating to /cart and back.
//
// Layout (docs/features/mcdelivery-redesign/plan.md, Phase 1): hero, the
// "Our Menu" band (heading + search), then three columns — category rail,
// menu grid (with the chat below it until Phase 5 moves voice/chat into
// the header), and a sticky column holding the item detail and the cart.
// DOM order is reading order at every width; only the styling changes.
export default async function Home() {
  const categories = await getMenu();

  return (
    <main className={styles.main}>
      <HeroBanner />
      <MenuBand />
      <div className={styles.layout}>
        <div className={styles.rail}>
          <CategoryFilter categories={categories} />
        </div>
        <section className={styles.content} aria-label="Menu items">
          <MenuList categories={categories} />
          <ChatInput />
        </section>
        <div className={styles.side}>
          <ItemDetailPanel categories={categories}>
            <ItemDetailNudge />
          </ItemDetailPanel>
          <CartPanel />
          <CartNudge />
          <CommandLogPanel />
        </div>
      </div>
      <NudgeToast />
    </main>
  );
}
