import { CheckoutFlow } from "../../components/checkout/CheckoutFlow";
import styles from "./page.module.css";

// No server-side data: CheckoutFlow reads commerce-api's cart from
// useCart(), whose lines arrive already named and priced, so this route no
// longer needs the menu and prerenders as a static shell
// (docs/features/phase-11-web-commerce-integration/plan.md §3, §5). The
// root app/error.tsx remains the error boundary — see
// docs/features/phase-4-frontend-checkout-simulation/plan.md §12.
export default function CheckoutPage() {
  return (
    <main className={styles.main}>
      <h1>Checkout</h1>
      <CheckoutFlow />
    </main>
  );
}
