import styles from "./page.module.css";

// Next.js renders this automatically while page.tsx's async work (getMenu())
// is pending — same convention as app/loading.tsx.
export default function Loading() {
  return (
    <main className={styles.main} aria-busy="true">
      <h1>Cart</h1>
      <p role="status">Loading your cart…</p>
    </main>
  );
}
