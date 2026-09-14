import styles from "./page.module.css";

// Next.js renders this automatically while page.tsx's async work (getMenu())
// is pending — no explicit <Suspense> wiring needed for a page-level async
// Server Component.
export default function Loading() {
  return (
    <main className={styles.main} aria-busy="true">
      <h1>Food Ordering Platform</h1>
      <p role="status">Loading the menu…</p>
    </main>
  );
}
