import Link from "next/link";
import styles from "./page.module.css";

// Any unknown route (Phase 18, plan.md §10), in the app's own layout rather
// than Next's bare default. Static: it echoes nothing from the request.
export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1>Page not found</h1>
      <p>There&apos;s nothing at this address.</p>
      <Link href="/">Back to the menu</Link>
    </main>
  );
}
