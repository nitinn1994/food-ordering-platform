import Link from "next/link";
import { StaticPage } from "../components/layout/StaticPage";
import styles from "./not-found.module.css";

// Any unknown route (Phase 18, plan.md §10), in the app's own layout rather
// than Next's bare default. Static: it echoes nothing from the request.
// Styled as the other inner pages (mcdelivery-parity Phase 4); the
// reference itself has no not-found page.
export default function NotFound() {
  return (
    <StaticPage title="Page not found" intro="There's nothing at this address.">
      <Link href="/" className={styles.home}>
        Back to the menu
      </Link>
    </StaticPage>
  );
}
