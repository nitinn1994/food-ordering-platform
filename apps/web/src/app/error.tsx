"use client";

import styles from "./page.module.css";

// Next.js renders this automatically if page.tsx's async work (getMenu())
// rejects. Error boundaries in the App Router must be Client Components.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.main}>
      <h1>Food Ordering Platform</h1>
      <p role="alert">
        Something went wrong loading the menu: {error.message}
      </p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
