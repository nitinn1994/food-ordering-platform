"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../../lib/state/cartStore";
import styles from "./SiteNav.module.css";

export function SiteNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();

  return (
    <nav className={styles.nav} aria-label="Primary">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        Menu
      </Link>
      <Link
        href="/cart"
        aria-current={pathname === "/cart" ? "page" : undefined}
      >
        Cart ({itemCount})
      </Link>
    </nav>
  );
}
