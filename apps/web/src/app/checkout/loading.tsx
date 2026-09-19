import styles from "./page.module.css";

// Next.js renders this automatically while page.tsx's async work (getMenu())
// is pending — same convention as app/cart/loading.tsx.
export default function Loading() {
  return (
    <main className={styles.main} aria-busy="true">
      <h1>Checkout</h1>
      <p role="status">Loading your checkout…</p>
    </main>
  );
}
