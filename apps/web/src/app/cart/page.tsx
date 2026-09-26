import { CartList } from "../../components/cart/CartList";
import styles from "./page.module.css";

// No server-side data: CartList renders commerce-api's cart from
// useCart(), loaded in the browser through the same-origin proxy, and
// every line arrives already named and priced — so this route no longer
// needs the menu at all, and prerenders as a static shell
// (docs/features/phase-11-web-commerce-integration/plan.md §3, §4).
export default function CartPage() {
  return (
    <main className={styles.main}>
      <h1>Cart</h1>
      <CartList />
    </main>
  );
}
