import { CartList } from "../../components/cart/CartList";
import { getMenu } from "../../lib/menu/menuSource";
import styles from "./page.module.css";

export default async function CartPage() {
  const categories = await getMenu();

  return (
    <main className={styles.main}>
      <h1>Cart</h1>
      <CartList categories={categories} />
    </main>
  );
}
