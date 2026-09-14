import { CategoryFilter } from "../components/menu/CategoryFilter";
import { MenuList } from "../components/menu/MenuList";
import { CartPanel } from "../components/cart/CartPanel";
import { ChatInput } from "../components/chat/ChatInput";
import { CommandLogPanel } from "../components/dev/CommandLogPanel";
import { CartProvider } from "../lib/state/cartStore";
import { UiProvider } from "../lib/state/uiStore";
import styles from "./page.module.css";

export default function Home() {
  return (
    <UiProvider>
      <CartProvider>
        <main className={styles.main}>
          <h1>Food Ordering Platform</h1>
          <div className={styles.layout}>
            <section>
              <CategoryFilter />
              <MenuList />
              <ChatInput />
            </section>
            <div>
              <CartPanel />
              <CommandLogPanel />
            </div>
          </div>
        </main>
      </CartProvider>
    </UiProvider>
  );
}
