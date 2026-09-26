"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

// Next.js renders this automatically if page.tsx's async work (getMenu())
// rejects. Error boundaries in the App Router must be Client Components.
//
// The copy is static: `error` may carry commerce-api or network detail
// (an ApiError's developer summary, or anything else a Server Component
// threw), and none of it is for the user — docs/features/phase-11-web-
// commerce-integration/plan.md §11, AC3. The prop stays in the signature
// because Next.js always passes it.
//
// "Try again" refreshes the route as well as resetting the boundary:
// reset() alone only re-renders the client boundary and never re-runs the
// Server Component whose getMenu() failed, so on its own it could not
// recover once commerce-api was back — found in the Phase 11 live walk.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <main className={styles.main}>
      <h1>Food Ordering Platform</h1>
      <p role="alert">
        We couldn&apos;t load the menu right now. Please try again.
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
