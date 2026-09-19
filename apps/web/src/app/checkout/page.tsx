import { CheckoutFlow } from "../../components/checkout/CheckoutFlow";
import { getMenu } from "../../lib/menu/menuSource";
import styles from "./page.module.css";

// Async Server Component, the same shape as app/cart/page.tsx: getMenu() is
// awaited once here and passed down as a prop. loading.tsx (sibling) is
// Next.js's own Suspense wiring around this await; the root app/error.tsx is
// relied on for the error boundary — see
// docs/features/phase-4-frontend-checkout-simulation/plan.md §12.
export default async function CheckoutPage() {
  const categories = await getMenu();

  return (
    <main className={styles.main}>
      <h1>Checkout</h1>
      <CheckoutFlow categories={categories} />
    </main>
  );
}
