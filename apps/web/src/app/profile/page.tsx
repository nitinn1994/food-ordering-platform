import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "../../components/layout/StaticPage";
import { LoginPlaceholder } from "../../components/profile/LoginPlaceholder";
import { FOOTER_LINKS } from "../../lib/content/footerLinks";
import { BRAND_NAME } from "../../lib/brand";
import styles from "./page.module.css";

export const metadata: Metadata = { title: `My Account — ${BRAND_NAME}` };

// The guest account page (docs/features/mcdelivery-parity/
// reference-inventory.md §18; AC12). Below 1200px there is no site footer,
// so this is where the same pages are linked (Phase 2).
export default function ProfilePage() {
  return (
    <StaticPage title="My Account">
      <section className={styles.card} aria-labelledby="guest-title">
        <h2 id="guest-title">You are ordering as a guest</h2>
        <p>Sign in to save addresses and see past orders — coming later.</p>
        <LoginPlaceholder />
      </section>
      <nav aria-label="More">
        <ul className={styles.links}>
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>
                {link.label}
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </StaticPage>
  );
}
