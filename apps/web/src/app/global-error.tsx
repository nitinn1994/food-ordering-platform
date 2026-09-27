"use client";

// The last boundary: Next.js renders this when the root layout itself
// throws, replacing the whole document — hence its own <html> and <body>
// (Phase 18, plan.md §10). Like error.tsx, the copy is static: `error` may
// carry server or network detail that is not for the customer. No styles:
// the layout that imports them is what failed.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Food Ordering Platform</h1>
          <p role="alert">Something went wrong. Please try again.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
