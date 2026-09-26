import { CategoryFilter } from "../components/menu/CategoryFilter";
import { MenuSearch } from "../components/menu/MenuSearch";
import { MenuList } from "../components/menu/MenuList";
import { ItemDetailPanel } from "../components/menu/ItemDetailPanel";
import { CartPanel } from "../components/cart/CartPanel";
import { ChatInput } from "../components/chat/ChatInput";
import { CommandLogPanel } from "../components/dev/CommandLogPanel";
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
export default async function Home() {
  const categories = await getMenu();

  return (
    <main className={styles.main}>
      <h1>Food Ordering Platform</h1>
      <div className={styles.layout}>
        <section className={styles.column}>
          <CategoryFilter categories={categories} />
          <MenuSearch />
          <MenuList categories={categories} />
          <ItemDetailPanel categories={categories} />
          <ChatInput />
        </section>
        <div className={styles.column}>
          <CartPanel />
          <CommandLogPanel />
        </div>
      </div>
    </main>
  );
}
