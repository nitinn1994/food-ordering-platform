import { CategoryFilter } from "../components/menu/CategoryFilter";
import { MenuSearch } from "../components/menu/MenuSearch";
import { MenuList } from "../components/menu/MenuList";
import { ItemDetailPanel } from "../components/menu/ItemDetailPanel";
import { CartPanel } from "../components/cart/CartPanel";
import { ChatInput } from "../components/chat/ChatInput";
import { CommandLogPanel } from "../components/dev/CommandLogPanel";
import { CartProvider } from "../lib/state/cartStore";
import { UiProvider } from "../lib/state/uiStore";
import { getMenu } from "../lib/menu/menuSource";
import styles from "./page.module.css";

// Async Server Component: getMenu() is awaited here, once, and the result is
// passed down as a prop everywhere it's needed. loading.tsx and error.tsx
// (siblings in this directory) are Next.js's own Suspense/error-boundary
// wiring around this await — no explicit <Suspense> needed for a page-level
// async Server Component.
export default async function Home() {
  const categories = await getMenu();

  return (
    <UiProvider>
      <CartProvider categories={categories}>
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
      </CartProvider>
    </UiProvider>
  );
}
