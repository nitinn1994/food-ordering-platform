import Link from "next/link";
import { BRAND_NAME } from "../../lib/brand";
import { FOOTER_LINKS } from "../../lib/content/footerLinks";
import styles from "./SiteFooter.module.css";

// The reference's black site footer (docs/features/mcdelivery-parity/
// reference-inventory.md §1): one row of links separated by bars, a
// nutrition note and the copyright line. No licence numbers or social
// accounts — this is a placeholder brand (OQ1).
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <nav aria-label="Footer">
        <ul className={styles.links}>
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className={styles.note}>
        An average active adult needs about 2,000 kcal of energy a day, though
        individual needs vary.
      </p>
      <p className={styles.copyright}>
        © {new Date().getFullYear()} {BRAND_NAME} · demo application
      </p>
    </footer>
  );
}
