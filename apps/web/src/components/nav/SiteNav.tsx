"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../../lib/state/cartStore";
import styles from "./SiteNav.module.css";

export function SiteNav() {
  const pathname = usePathname();
  // The count appears once commerce-api has answered — never a guessed 0
  // while the cart is still loading or could not be loaded.
  const { itemCount, status } = useCart();

  return (
    <nav className={styles.nav} aria-label="Primary">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        Menu
      </Link>
      <Link
        href="/cart"
        aria-current={pathname === "/cart" ? "page" : undefined}
      >
        {status === "ready" ? `Cart (${itemCount})` : "Cart"}
      </Link>
    </nav>
  );
}
