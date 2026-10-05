import type { ReactNode } from "react";
import styles from "./StaticPage.module.css";

// The reference's shared inner-page template (docs/features/
// mcdelivery-parity/reference-inventory.md §16): a large title, an optional
// lead paragraph, then the page's content in one centred column. Used by
// search, offers, restaurants, account and the static pages, and the
// not-found page. `wide` gives grid pages (offers, search) the full content
// width.
export function StaticPage({
  title,
  intro,
  wide = false,
  children,
}: {
  title: string;
  intro?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={wide ? `${styles.page} ${styles.wide}` : styles.page}>
      <h1 className={styles.title}>{title}</h1>
      {intro !== undefined && <p className={styles.intro}>{intro}</p>}
      {children}
    </main>
  );
}
